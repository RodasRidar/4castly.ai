"""What the services need from the outside world, built once at startup and swappable in tests."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncEngine

from api.ports.auth import TokenVerifier


@dataclass(frozen=True)
class Container:
    engine: AsyncEngine | None
    verifier: TokenVerifier
