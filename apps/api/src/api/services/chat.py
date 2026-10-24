"""Chat: persist the question, stream the answer through the number guard, store the turn.

The history is append-only. `messages.blocks` holds the raw API messages of each row and is replayed
unchanged; hidden `system` rows carry context changes (first message, a recalculated run, a new
language or style) and the retry marker. Users cannot update messages, so the assistant's row is
written once, when the turn ends (complete, failed or interrupted) under an id announced up front.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import anyio
import structlog
from opentelemetry import context as otel_context
from opentelemetry import trace
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.assistant.figures import Refs
from api.assistant.guard import StreamGuard
from api.auth import Principal, Tx
from api.domain.errors import AppError, AssistantUnavailableError, ConflictError, NotFoundError
from api.errors import new_ref
from api.ports.assistant import Message, TextDelta, ToolFinished, ToolStarted, TurnFinished
from api.schemas import MessageCreate
from api.schemas.chat import (
    AnnotationEvent,
    MessageEndEvent,
    MessageStartEvent,
    StreamErrorEvent,
    TextDeltaEvent,
    TokenUsage,
    ToolEndEvent,
    ToolStartEvent,
)
from api.schemas.enums import StopReason
from api.services import limits
from api.services.assistant_tools import Toolbox

LANGUAGES = {"es": "Spanish (es-PE)", "en": "English"}
UNAVAILABLE_KEY = "errors.assistantUnavailable"
REFUSAL_KEY = "errors.assistantRefusal"
RETRY_MARKER = "<retry>Please answer my previous question again, with a better answer.</retry>"

_CONVERSATION = text(
    "select current_run_id from public.conversations where id = :id and deleted_at is null"
)
_PROFILE = text("select locale, assistant_style from public.profiles where user_id = :user_id")
_PRODUCT_IN_RUN = text(
    "select p.id from public.run_product_metrics m "
    "join public.products p on p.tenant_id = m.tenant_id and p.id = m.product_id "
    "where m.run_id = :run and p.code = :code"
)
_PRODUCT_NAME = text("select code, name from public.products where id = :id")
_LAST_CONTEXT = text(
    "select payload -> 'context' as context from public.messages "
    "where conversation_id = :id and role = 'system' and payload -> 'context' is not null "
    "order by seq desc limit 1"
)
_HISTORY = text(
    "select role, blocks from public.messages "
    "where conversation_id = :id and jsonb_array_length(blocks) > 0 order by seq"
)
_ASSISTANT_COUNT = text(
    "select count(*) from public.messages where conversation_id = :id and role = 'assistant'"
)
_INSERT = text(
    "insert into public.messages (id, tenant_id, conversation_id, created_by, role, kind, blocks, "
    "display_text, payload, annotations, status, context_product_id) "
    "values (:id, :tenant_id, :conversation_id, :created_by, :role, :kind, cast(:blocks as jsonb), "
    ":display_text, cast(:payload as jsonb), cast(:annotations as jsonb), :status, :product_id)"
)
_RETRY_TARGET = text(
    "select m.id, m.seq, m.conversation_id, m.role, "
    "(select max(seq) from public.messages "
    " where conversation_id = m.conversation_id and role = 'assistant') as latest_seq, "
    "(select u.context_product_id from public.messages u "
    " where u.conversation_id = m.conversation_id and u.role = 'user' and u.seq < m.seq "
    " order by u.seq desc limit 1) as product_id, "
    "exists (select 1 from public.messages u where u.conversation_id = m.conversation_id "
    " and u.role = 'user' and u.seq < m.seq) as has_question "
    "from public.messages m where m.id = :id"
)


@dataclass(frozen=True)
class Prepared:
    message_id: UUID
    conversation_id: UUID
    run_id: UUID
    locale: str
    turn: int
    history: list[Message]


def _context_text(run_id: UUID, locale: str, style: str, previous: dict[str, str] | None) -> str:
    language = LANGUAGES.get(locale, LANGUAGES["es"])
    if previous is None:
        return (
            "<conversation_context>\n"
            f"results_id: {run_id}\nlanguage: {language}\nanswer_style: {style}\n"
            "</conversation_context>"
        )
    changes = []
    if previous.get("run_id") != str(run_id):
        changes.append(
            "the results were recalculated: earlier figures may be outdated, call the "
            "tools again before answering"
        )
    if previous.get("locale") != locale:
        changes.append(f"reply in {language} from now on")
    if previous.get("style") != style:
        changes.append(f"answer style is now {style}")
    return "<context_update>\n" + "\n".join(f"- {c}" for c in changes) + "\n</context_update>"


def api_messages(rows: Sequence[Any]) -> list[Message]:
    """Stored rows to API messages: replayed as they are, consecutive same-role ones merged."""
    merged: list[Message] = []
    for row in rows:
        for message in row.blocks:
            if merged and merged[-1]["role"] == message["role"]:
                merged[-1] = {
                    "role": message["role"],
                    "content": [*merged[-1]["content"], *message["content"]],
                }
            else:
                merged.append({"role": message["role"], "content": list(message["content"])})
    return merged


def _user_message(content: list[dict[str, Any]]) -> list[Message]:
    return [{"role": "user", "content": content}]


async def _insert(  # noqa: PLR0913
    session: AsyncSession,
    who: Principal,
    conversation_id: UUID,
    *,
    role: str,
    kind: str = "text",
    blocks: list[Message] | None = None,
    display_text: str = "",
    payload: dict[str, Any] | None = None,
    annotations: list[dict[str, Any]] | None = None,
    status: str = "complete",
    product_id: UUID | None = None,
    message_id: UUID | None = None,
) -> UUID:
    message_id = message_id or uuid4()
    await session.execute(
        _INSERT,
        {
            "id": message_id,
            "tenant_id": who.tenant_id,
            "conversation_id": conversation_id,
            "created_by": who.user_id if role == "user" else None,
            "role": role,
            "kind": kind,
            "blocks": json.dumps(blocks or []),
            "display_text": display_text,
            "payload": json.dumps(payload or {}),
            "annotations": json.dumps(annotations or []),
            "status": status,
            "product_id": product_id,
        },
    )
    return message_id


async def _open_turn(
    session: AsyncSession,
    who: Principal,
    conversation_id: UUID,
    new_messages: list[tuple[str, list[Message], UUID | None, str]],
) -> Prepared:
    """Shared by send and retry: checks, context rows, the new rows, and the replay history."""
    run_id = (await session.execute(_CONVERSATION, {"id": conversation_id})).first()
    if run_id is None:
        raise NotFoundError
    if run_id[0] is None:
        raise ConflictError("errors.noResultsYet")
    limit, window = limits.CHAT_LIMIT
    await limits.enforce(session, who, "chat", limit=limit, window_seconds=window)
    profile = (await session.execute(_PROFILE, {"user_id": who.user_id})).one_or_none()
    locale, style = (profile.locale, profile.assistant_style) if profile else ("es", "brief")
    signature = {"run_id": str(run_id[0]), "locale": locale, "style": style}
    last = (await session.execute(_LAST_CONTEXT, {"id": conversation_id})).scalar_one_or_none()
    if last != signature:
        note = _context_text(run_id[0], locale, style, last)
        await _insert(
            session,
            who,
            conversation_id,
            role="system",
            blocks=_user_message([{"type": "text", "text": note}]),
            payload={"context": signature},
        )
    for role, blocks, product_id, display in new_messages:
        await _insert(
            session,
            who,
            conversation_id,
            role=role,
            blocks=blocks,
            display_text=display,
            product_id=product_id,
        )
    rows = (await session.execute(_HISTORY, {"id": conversation_id})).all()
    count = (await session.execute(_ASSISTANT_COUNT, {"id": conversation_id})).scalar_one()
    return Prepared(uuid4(), conversation_id, run_id[0], locale, count + 1, api_messages(rows))


async def _prepare_send(
    session: AsyncSession, who: Principal, conversation_id: UUID, body: MessageCreate
) -> Prepared:
    product_id: UUID | None = None
    content: list[dict[str, Any]] = [{"type": "text", "text": body.text}]
    if body.context_product_code:
        run = (await session.execute(_CONVERSATION, {"id": conversation_id})).first()
        if run is None or run[0] is None:
            raise NotFoundError if run is None else ConflictError("errors.noResultsYet")
        product_id = (
            await session.execute(
                _PRODUCT_IN_RUN, {"run": run[0], "code": body.context_product_code}
            )
        ).scalar_one_or_none()
        if product_id is None:
            raise NotFoundError
        name = (await session.execute(_PRODUCT_NAME, {"id": product_id})).one()
        note = f"(The user is looking at product {name.code}, {name.name}.)"
        content.insert(0, {"type": "text", "text": note})
    return await _open_turn(
        session,
        who,
        conversation_id,
        [("user", _user_message(content), product_id, body.text)],
    )


async def prepare_send(tx: Tx, conversation_id: UUID, body: MessageCreate) -> Prepared:
    return await tx.run(_prepare_send, conversation_id, body)


async def _prepare_retry(session: AsyncSession, who: Principal, message_id: UUID) -> Prepared:
    target = (await session.execute(_RETRY_TARGET, {"id": message_id})).one_or_none()
    if target is None or target.role != "assistant":
        raise NotFoundError
    if target.seq != target.latest_seq or not target.has_question:
        raise ConflictError("errors.retryNotLatest")
    marker = _user_message([{"type": "text", "text": RETRY_MARKER}])
    return await _open_turn(session, who, target.conversation_id, [("system", marker, None, "")])


async def prepare_retry(tx: Tx, message_id: UUID) -> Prepared:
    return await tx.run(_prepare_retry, message_id)


def frame(event: BaseModel) -> str:
    return f"event: {event.event}\ndata: {event.model_dump_json()}\n\n"  # ty: ignore[unresolved-attribute]


_STOP = {
    "end_turn": StopReason.END_TURN,
    "max_tokens": StopReason.MAX_TOKENS,
    "refusal": StopReason.REFUSAL,
}


async def _store_answer(  # noqa: PLR0913
    tx: Tx,
    prepared: Prepared,
    *,
    kind: str,
    status: str,
    display_text: str,
    blocks: list[Message],
    annotations: list[dict[str, Any]],
    payload: dict[str, Any],
) -> None:
    async def write(session: AsyncSession, who: Principal) -> None:
        await _insert(
            session,
            who,
            prepared.conversation_id,
            role="assistant",
            kind=kind,
            blocks=blocks,
            display_text=display_text,
            payload=payload,
            annotations=annotations,
            status=status,
            message_id=prepared.message_id,
        )

    with anyio.CancelScope(shield=True):  # an aborted request still saves what was shown
        await tx.run(write)


async def stream(tx: Tx, prepared: Prepared) -> AsyncGenerator[str]:  # noqa: PLR0912, PLR0915
    log = structlog.get_logger()
    message_id = prepared.message_id
    refs = Refs(prepared.turn)
    guard = StreamGuard(refs, prepared.locale)
    toolbox = Toolbox(tx, prepared.run_id, refs)
    tracer = trace.get_tracer("api.assistant")
    span = tracer.start_span("assistant.turn")
    span.set_attribute("langfuse.session.id", str(prepared.conversation_id))
    span.set_attribute("langfuse.user.id", str(tx.who.user_id))
    trace_id = format(span.get_span_context().trace_id, "032x")
    token = otel_context.attach(trace.set_span_in_context(span))
    shown: list[str] = []
    annotations: list[dict[str, Any]] = []

    def emit(output: Any) -> list[str]:
        frames: list[str] = []
        if output.text:
            shown.append(output.text)
            frames.append(frame(TextDeltaEvent(message_id=message_id, text=output.text)))
        for annotation in output.annotations:
            annotations.append(annotation.model_dump(mode="json"))
            frames.append(frame(AnnotationEvent(message_id=message_id, annotation=annotation)))
        return frames

    yield frame(MessageStartEvent(message_id=message_id))
    try:
        finished: TurnFinished | None = None
        async for event in tx.container.agent.run_turn(prepared.history, toolbox):
            if isinstance(event, TextDelta):
                for item in emit(guard.feed(event.text)):
                    yield item
            elif isinstance(event, ToolStarted):
                yield frame(
                    ToolStartEvent(
                        tool_call_id=event.call_id, status_key=f"assistant.tool.{event.tool}"
                    )
                )
            elif isinstance(event, ToolFinished):
                yield frame(ToolEndEvent(tool_call_id=event.call_id))
            elif isinstance(event, TurnFinished):
                finished = event
        for item in emit(guard.finish()):
            yield item
        if finished is None:
            raise AssistantUnavailableError
        usage = finished.usage
        span.set_attribute("assistant.guard_hits", guard.hits)
        log.info(
            "assistant.turn",
            stop_reason=finished.stop_reason,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            guard_hits=guard.hits,
        )
        if finished.stop_reason == "refusal":
            payload = {"kind": "error", "message_key": REFUSAL_KEY, "ref": new_ref()}
            await _store_answer(
                tx,
                prepared,
                kind="error",
                status="complete",
                display_text="",
                blocks=[],
                annotations=[],
                payload=payload,
            )
        else:
            await _store_answer(
                tx,
                prepared,
                kind="text",
                status="complete",
                display_text="".join(shown),
                blocks=finished.messages,
                annotations=annotations,
                payload={"kind": "text", "trace_id": trace_id},
            )
        yield frame(
            MessageEndEvent(
                message_id=message_id,
                stop_reason=_STOP.get(finished.stop_reason, StopReason.END_TURN),
                usage=TokenUsage(
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    cache_read_tokens=usage.cache_read_tokens,
                ),
            )
        )
    except (asyncio.CancelledError, GeneratorExit):
        await _store_answer(
            tx,
            prepared,
            kind="text",
            status="interrupted",
            display_text="".join(shown),
            blocks=[],
            annotations=annotations,
            payload={"kind": "text", "trace_id": trace_id},
        )
        raise
    except Exception as error:
        if not isinstance(error, AppError):
            log.exception("assistant.turn_failed")
        ref = new_ref()
        await _store_answer(
            tx,
            prepared,
            kind="error",
            status="error",
            display_text="",
            blocks=[],
            annotations=[],
            payload={"kind": "error", "message_key": UNAVAILABLE_KEY, "ref": ref},
        )
        yield frame(StreamErrorEvent(message_key=UNAVAILABLE_KEY, ref=ref))
    finally:
        span.end()
        try:
            otel_context.detach(token)
        except ValueError:  # closed from another context: the span is already ended
            log.debug("assistant.context_detach_skipped")
