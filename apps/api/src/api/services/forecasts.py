"""Start a forecast from a confirmed conversation (the clarification answers become job params)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import ConflictError, NotFoundError
from api.schemas import ForecastRequest, JobAccepted
from api.services import idempotency, limits

STARTABLE_STAGES = {"confirmed", "clarifying"}

_STAGE = text("select stage from public.conversations where id = :id and deleted_at is null")
_ASSISTANT_STYLE = text("select assistant_style from public.profiles where user_id = :user_id")
_INSERT_JOB = text(
    "insert into public.jobs (id, tenant_id, conversation_id, kind, params) "
    "values (:id, :tenant_id, :conversation_id, 'forecast', cast(:params as jsonb))"
)
_CALCULATING = text(
    "update public.conversations set stage = 'calculating', last_activity_at = now() where id = :id"
)


def _job_params(body: ForecastRequest, assistant_style: str) -> dict[str, Any]:
    params: dict[str, Any] = {"assistant_style": assistant_style}
    if body.answers is not None:
        params |= body.answers.model_dump(mode="json", exclude_none=True)
    return params


async def _enqueue(  # noqa: PLR0913, PLR0917 - session, principal and the request parts
    session: AsyncSession,
    who: Principal,
    conversation_id: UUID,
    body: ForecastRequest,
    key: str | None,
    hash_: str,
) -> tuple[JobAccepted, bool]:
    """The accepted job and whether it is new (a replay must not spawn the worker again)."""
    if key and (replayed := await idempotency.replay(session, who, key, hash_)) is not None:
        return JobAccepted.model_validate(replayed), False
    stage = (await session.execute(_STAGE, {"id": conversation_id})).scalar_one_or_none()
    if stage is None:
        raise NotFoundError
    if stage not in STARTABLE_STAGES:
        raise ConflictError("errors.forecastNotStartable")
    limit, window = limits.FORECAST_LIMIT
    await limits.enforce(session, who, "forecast", limit=limit, window_seconds=window)
    style = (await session.execute(_ASSISTANT_STYLE, {"user_id": who.user_id})).scalar_one_or_none()
    job_id = uuid4()
    await session.execute(
        _INSERT_JOB,
        {
            "id": job_id,
            "tenant_id": who.tenant_id,
            "conversation_id": conversation_id,
            "params": json.dumps(_job_params(body, style or "brief")),
        },
    )
    await session.execute(_CALCULATING, {"id": conversation_id})
    accepted = JobAccepted(job_id=job_id, conversation_id=conversation_id)
    if key:
        await idempotency.save(session, who, key, hash_, accepted.model_dump(mode="json"))
    return accepted, True


async def start_forecast(
    tx: Tx, conversation_id: UUID, body: ForecastRequest, key: str | None
) -> JobAccepted:
    hash_ = idempotency.request_hash(
        "start_forecast", str(conversation_id), body.model_dump(mode="json")
    )
    accepted, created = await tx.run(_enqueue, conversation_id, body, key, hash_)
    if not created:
        return accepted
    try:
        await tx.container.spawner.spawn("forecast", accepted.job_id)
    except Exception:
        structlog.get_logger().warning("job.spawn_failed", job_id=str(accepted.job_id))
    return accepted
