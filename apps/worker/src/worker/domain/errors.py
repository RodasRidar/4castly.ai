"""Errors the pipeline distinguishes: some are the user's file, some are ours."""

from __future__ import annotations

UNREADABLE_CODES = ("password_protected", "corrupt", "unsupported_format", "empty", "too_large")


class UnreadableFileError(Exception):
    """The file cannot be used. Deterministic: never retried, shown with its own message (08a)."""

    def __init__(self, code: str, detail: str = "") -> None:
        if code not in UNREADABLE_CODES:
            message = f"unknown unreadable code: {code}"
            raise ValueError(message)
        super().__init__(detail or code)
        self.code = code


class PermanentJobError(Exception):
    """A deterministic failure of the job itself (bad state, missing data). Not retried (R2)."""


class JobCancelledError(Exception):
    """The user asked to cancel; raised at the next safe point between stages."""
