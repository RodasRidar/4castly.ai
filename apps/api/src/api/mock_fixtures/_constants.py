"""Fixed clock and ids so the generated fixtures are byte-for-byte reproducible."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid5

_NAMESPACE = UUID("6c1f0a0e-4c5b-4b43-9a4e-5d1b7c8f2a10")
LIMA = timezone(timedelta(hours=-5))
NOW = datetime(2026, 10, 23, 9, 30, tzinfo=LIMA)
TODAY: date = NOW.date()
DATA_UNTIL = date(2026, 10, 18)
HORIZON_WEEKS = 12
RUN_LEAD_TIME_DAYS = 30
TARGET_COVERAGE_WEEKS = 4
TENANT_NAME = "Droguería Demo S.A.C."
SUPPORT_REF = "K7Q2WX"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

READY_CONVERSATION = "conv-ready-pinned"
RUN_KEY = "run-ready"


def uid(name: str) -> UUID:
    """Stable id for a named fixture entity."""
    return uuid5(_NAMESPACE, name)


def ago(**delta: float) -> datetime:
    """A moment before the fixed `NOW`, in UTC-5 like the tenant's time zone."""
    return (NOW - timedelta(**delta)).astimezone(LIMA)
