"""A run as stored (`forecast_runs`) and the contract views built from it.

`params` is what the worker computed with (including `defaults_used`, `stock_known`, `data_until`);
`pending_params` holds drawer values saved but not applied yet (applied on the next recalculation).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

import inventory as inv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.domain.errors import NotFoundError
from api.schemas import ForecastRun, RunParameters
from api.schemas.enums import DefaultedParameter, RunStatus

DEFAULT_THRESHOLDS = {"critical_margin_weeks": 0.0, "medium_margin_weeks": 2.0}
_PARAMETER_KEYS = (
    "horizon_weeks",
    "granularity",
    "lead_time_days",
    "target_coverage_weeks",
    "risk_thresholds",
    "assistant_style",
)

_LOAD = text(
    "select id, conversation_id, status, data_until, horizon_weeks, params, pending_params, "
    "created_at from public.forecast_runs where id = :id and status in ('ready', 'superseded')"
)


@dataclass(frozen=True)
class RunInfo:
    id: UUID
    conversation_id: UUID
    status: RunStatus
    data_until: date
    horizon_weeks: int
    params: dict[str, Any]
    pending: dict[str, Any] | None
    created_at: datetime

    @property
    def stock_known(self) -> bool:
        return bool(self.params.get("stock_known", True))

    @property
    def thresholds(self) -> inv.RiskThresholds:
        return inv.RiskThresholds(**self.applied().risk_thresholds.model_dump())

    def applied(self) -> RunParameters:
        """The parameters the results were computed with."""
        return _parameters(self.params, self.horizon_weeks)

    def current(self) -> RunParameters:
        """What the drawer shows: saved values if there are any, otherwise the applied ones."""
        return _parameters(self.pending, self.horizon_weeks) if self.pending else self.applied()

    @property
    def parameters_pending(self) -> bool:
        return self.pending is not None and self.current() != self.applied()


def _parameters(raw: dict[str, Any], horizon: int) -> RunParameters:
    data = {k: raw[k] for k in _PARAMETER_KEYS if k in raw}
    data.setdefault("horizon_weeks", horizon)
    data.setdefault("granularity", "weekly")
    data.setdefault("risk_thresholds", DEFAULT_THRESHOLDS)
    data.setdefault("assistant_style", "brief")
    return RunParameters.model_validate(data)


async def load_run(session: AsyncSession, run_id: UUID) -> RunInfo:
    """A ready or superseded run of the caller's tenant; anything else is a 404."""
    row = (await session.execute(_LOAD, {"id": run_id})).one_or_none()
    if row is None:
        raise NotFoundError
    return RunInfo(
        id=row.id,
        conversation_id=row.conversation_id,
        status=RunStatus(row.status),
        data_until=row.data_until,
        horizon_weeks=row.horizon_weeks,
        params=dict(row.params),
        pending=dict(row.pending_params) if row.pending_params else None,
        created_at=row.created_at,
    )


def forecast_run(info: RunInfo, today: date) -> ForecastRun:
    return ForecastRun(
        id=info.id,
        conversation_id=info.conversation_id,
        status=info.status,
        data_until=info.data_until,
        parameters=info.current(),
        defaults_used=[DefaultedParameter(d) for d in info.params.get("defaults_used", [])],
        stale=inv.is_stale(info.data_until, today),
        parameters_pending=info.parameters_pending,
        created_at=info.created_at,
    )
