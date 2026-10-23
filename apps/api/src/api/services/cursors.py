"""Opaque pagination cursors: urlsafe base64 of a small JSON object."""

from __future__ import annotations

import base64
import binascii
import json
from typing import Any

from api.domain.errors import BusinessRuleError


def encode(values: dict[str, Any]) -> str:
    raw = json.dumps(values, separators=(",", ":"), default=str).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode(cursor: str) -> dict[str, Any]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        values = json.loads(raw)
    except (binascii.Error, ValueError) as error:
        raise BusinessRuleError("errors.invalidCursor") from error
    if not isinstance(values, dict):
        raise BusinessRuleError("errors.invalidCursor")
    return values
