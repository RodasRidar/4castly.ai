"""Redaction for every log line before it leaves the process (S9: no client data in Axiom)."""

from __future__ import annotations

import re
from typing import Any

REDACTED = "[redacted]"

# Whatever the value, these keys carry file contents, chat text or credentials.
_DENY_KEYS = frozenset(
    {
        "text",
        "display_text",
        "content",
        "prompt",
        "completion",
        "file_content",
        "password",
        "authorization",
        "token",
        "secret",
        "api_key",
        "email",
    }
)

# Order matters: a JWT must be masked as a JWT before the generic Bearer rule sees it.
_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+"), "[jwt]"),
    (re.compile(r"\bBearer\s+[\w.~+/=-]+", re.IGNORECASE), "[secret]"),
    (re.compile(r"\bsk-[\w-]{16,}"), "[secret]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
)


def _mask(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact(value: Any) -> Any:
    """Return a copy with sensitive keys replaced and sensitive patterns masked in strings."""
    if isinstance(value, dict):
        return {
            key: REDACTED if str(key).lower() in _DENY_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list | tuple):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return _mask(value)
    return value
