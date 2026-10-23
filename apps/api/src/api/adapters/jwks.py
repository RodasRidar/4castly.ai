"""Local verification of Supabase access tokens (S4): signature from the project's JWKS, plus
`iss`, `aud` and `exp`. The key set is cached for at most ten minutes so a rotation is picked up."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx
import jwt
from jwt.algorithms import ECAlgorithm, OKPAlgorithm, RSAAlgorithm

from api.domain.errors import UnauthenticatedError, UnavailableError

CACHE_SECONDS = 600
UNKNOWN_KID_COOLDOWN_SECONDS = 30
"""A token with an unknown key id may refresh the set, but not more often than this."""
ASYMMETRIC_ALGORITHMS = ("RS256", "ES256", "EdDSA")
FETCH_TIMEOUT_SECONDS = 5.0

Fetch = Callable[[str], Awaitable[dict[str, Any]]]


async def fetch_jwks(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


def _load_key(jwk: Mapping[str, Any]) -> Any:
    import json  # noqa: PLC0415 - only needed when a key is loaded

    raw = json.dumps(jwk)
    match jwk.get("kty"):
        case "RSA":
            return RSAAlgorithm.from_jwk(raw)
        case "EC":
            return ECAlgorithm.from_jwk(raw)
        case "OKP":
            return OKPAlgorithm.from_jwk(raw)
        case _:
            raise ValueError("unsupported key type")


class JwksTokenVerifier:
    def __init__(
        self,
        *,
        jwks_url: str,
        issuer: str,
        audience: str,
        fetch: Fetch = fetch_jwks,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._url = jwks_url
        self._issuer = issuer
        self._audience = audience
        self._fetch = fetch
        self._clock = clock
        self._keys: dict[str, Any] = {}
        self._fetched_at: float | None = None

    async def verify(self, token: str) -> Mapping[str, object]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise UnauthenticatedError from error
        kid, algorithm = header.get("kid"), header.get("alg")
        if algorithm not in ASYMMETRIC_ALGORITHMS or not isinstance(kid, str):
            raise UnauthenticatedError
        key = await self._key_for(kid)
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except jwt.PyJWTError as error:
            raise UnauthenticatedError from error

    async def _key_for(self, kid: str) -> Any:
        now = self._clock()
        if (
            self._fetched_at is None
            or now - self._fetched_at >= CACHE_SECONDS
            or (kid not in self._keys and now - self._fetched_at >= UNKNOWN_KID_COOLDOWN_SECONDS)
        ):
            await self._refresh(now)
        try:
            return self._keys[kid]
        except KeyError as error:
            raise UnauthenticatedError from error

    async def _refresh(self, now: float) -> None:
        try:
            document = await self._fetch(self._url)
        except (httpx.HTTPError, OSError, ValueError) as error:
            raise UnavailableError from error
        keys: dict[str, Any] = {}
        for jwk in document.get("keys", []):
            kid = jwk.get("kid")
            try:
                if isinstance(kid, str):
                    keys[kid] = _load_key(jwk)
            except (ValueError, jwt.PyJWTError):
                continue
        self._keys, self._fetched_at = keys, now
