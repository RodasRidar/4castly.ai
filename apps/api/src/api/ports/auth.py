from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol


class TokenVerifier(Protocol):
    """Checks a bearer token and returns its claims.

    Raises `UnauthenticatedError` for a token that cannot be trusted and `UnavailableError` when the
    key source cannot be reached, so an outage never looks like a bad login.
    """

    async def verify(self, token: str) -> Mapping[str, object]: ...
