"""Job vocabulary shared by the use cases and their adapters."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any
from uuid import UUID

KIND_DIGEST = "digest"
KIND_FORECAST = "forecast"

STAGE_READING_FILE = "reading_file"
STAGE_IDENTIFYING_COLUMNS = "identifying_columns"
STAGE_CLEANING_DATA = "cleaning_data"
STAGE_CALCULATING_FORECAST = "calculating_forecast"
STAGE_READY = "ready"

_REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # no 0/O, 1/I/L: read aloud to support
_REF_LENGTH = 6


def new_ref() -> str:
    """Short support code stored on a failed job (never a stack trace)."""
    return "".join(secrets.choice(_REF_ALPHABET) for _ in range(_REF_LENGTH))


@dataclass(frozen=True)
class JobClaim:
    """A claimed job: every later query carries `tenant_id` from here."""

    job_id: UUID
    tenant_id: UUID
    conversation_id: UUID
    kind: str
    params: dict[str, Any]
    attempts: int
    traceparent: str | None = None


@dataclass(frozen=True)
class StuckJob:
    job_id: UUID
    tenant_id: UUID
    conversation_id: UUID
    kind: str
    status: str
    attempts: int
    exhausted: bool
    """No attempts left: fail it instead of spawning it again."""
