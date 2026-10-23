"""Parameters drawer and recalculation.

Saving only stores the values on the run (`pending_params`); results change when a recalculation
job builds a new run. The job carries just the parameters that differ from the applied ones, so a
parameter the user never touched keeps being reported as a default in the results.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import BusinessRuleError, ConflictError
from api.schemas import JobAccepted, RunParameters
from api.schemas.enums import Granularity, RunStatus
from api.services import audit, limits
from api.services.run_data import RunInfo, load_run

_SAVE = text(
    "update public.forecast_runs set pending_params = cast(:pending as jsonb) where id = :id"
)
_CONVERSATION_STAGE = text("select stage from public.conversations where id = :id")
_INSERT_JOB = text(
    "insert into public.jobs (id, tenant_id, conversation_id, kind, params) "
    "values (:id, :tenant_id, :conversation_id, 'forecast', cast(:params as jsonb))"
)
_CALCULATING = text(
    "update public.conversations set stage = 'calculating', last_activity_at = now() where id = :id"
)
_TUNABLE = (
    "horizon_weeks",
    "lead_time_days",
    "target_coverage_weeks",
    "risk_thresholds",
    "assistant_style",
)


def _editable(info: RunInfo) -> None:
    if info.status is not RunStatus.READY:
        raise ConflictError("errors.runSuperseded")


async def save_parameters(
    session: AsyncSession, who: Principal, run_id: UUID, body: RunParameters
) -> RunParameters:
    del who
    info = await load_run(session, run_id)
    _editable(info)
    if body.granularity is not Granularity.WEEKLY:
        raise BusinessRuleError("errors.granularityUnsupported")
    unchanged = body == info.applied()
    pending = None if unchanged else json.dumps(body.model_dump(mode="json"))
    await session.execute(_SAVE, {"id": run_id, "pending": pending})
    return body


def _changed_parameters(info: RunInfo) -> dict[str, Any]:
    applied, wanted = info.applied().model_dump(mode="json"), info.current().model_dump(mode="json")
    return {key: wanted[key] for key in _TUNABLE if wanted[key] != applied[key]}


async def _enqueue(session: AsyncSession, who: Principal, run_id: UUID) -> JobAccepted:
    info = await load_run(session, run_id)
    _editable(info)
    stage = (
        await session.execute(_CONVERSATION_STAGE, {"id": info.conversation_id})
    ).scalar_one_or_none()
    if stage != "ready":
        raise ConflictError("errors.forecastNotStartable")
    limit, window = limits.FORECAST_LIMIT
    await limits.enforce(session, who, "forecast", limit=limit, window_seconds=window)
    job_id = uuid4()
    await session.execute(
        _INSERT_JOB,
        {
            "id": job_id,
            "tenant_id": who.tenant_id,
            "conversation_id": info.conversation_id,
            "params": json.dumps({"recalculate": True, **_changed_parameters(info)}),
        },
    )
    await session.execute(_CALCULATING, {"id": info.conversation_id})
    await audit.log_event(session, who, "run.recalculated", "run", run_id)
    return JobAccepted(job_id=job_id, conversation_id=info.conversation_id)


async def recalculate(tx: Tx, run_id: UUID) -> JobAccepted:
    accepted = await tx.run(_enqueue, run_id)
    try:
        await tx.container.spawner.spawn("forecast", accepted.job_id)
    except Exception:
        structlog.get_logger().warning("job.spawn_failed", job_id=str(accepted.job_id))
    return accepted
