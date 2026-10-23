"""S4: the API verifies Supabase JWTs locally against a cached JWKS (iss, aud, exp)."""

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest

from api.adapters.jwks import JwksTokenVerifier
from api.domain.errors import UnauthenticatedError, UnavailableError

from .keys import AUDIENCE, ISSUER, TestKey, jwks

URL = "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json"


class Fetcher:
    """Counts JWKS downloads and serves whatever `keys` currently holds."""

    def __init__(self, *keys: TestKey) -> None:
        self.keys = list(keys)
        self.calls = 0

    async def __call__(self, url: str) -> dict[str, Any]:
        assert url == URL
        self.calls += 1
        return jwks(*self.keys)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture(scope="module")
def key() -> TestKey:
    return TestKey("key-1")


def verifier(fetch: Fetcher, clock: Clock | None = None) -> JwksTokenVerifier:
    return JwksTokenVerifier(
        jwks_url=URL,
        issuer=ISSUER,
        audience=AUDIENCE,
        fetch=fetch,
        clock=clock or Clock(),
    )


async def test_a_valid_token_returns_its_claims(key: TestKey) -> None:
    claims = await verifier(Fetcher(key)).verify(key.token({"email": "ana@example.com"}))

    assert claims["sub"] == "00000000-0000-0000-0000-0000000000aa"
    assert claims["email"] == "ana@example.com"


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 10},
        {"iss": "https://evil.example/auth/v1"},
        {"aud": "someone-else"},
    ],
    ids=["expired", "wrong-issuer", "wrong-audience"],
)
async def test_bad_claims_are_rejected(key: TestKey, overrides: dict[str, Any]) -> None:
    with pytest.raises(UnauthenticatedError):
        await verifier(Fetcher(key)).verify(key.token(overrides))


@pytest.mark.parametrize("missing", ["exp", "iss", "aud", "sub"])
async def test_required_claims_must_be_present(key: TestKey, missing: str) -> None:
    now = int(time.time())
    claims = {"iss": ISSUER, "aud": AUDIENCE, "sub": "u", "exp": now + 60}
    del claims[missing]
    token = jwt.encode(claims, key.private, algorithm="RS256", headers={"kid": key.kid})

    with pytest.raises(UnauthenticatedError):
        await verifier(Fetcher(key)).verify(token)


async def test_a_token_signed_by_another_key_is_rejected(key: TestKey) -> None:
    other = TestKey(key.kid)  # same kid, different key material

    with pytest.raises(UnauthenticatedError):
        await verifier(Fetcher(key)).verify(other.token())


async def test_a_symmetric_token_cannot_pass_as_an_asymmetric_one(key: TestKey) -> None:
    forged = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "sub": "u", "exp": int(time.time()) + 60},
        "shared-secret-that-is-long-enough-for-hs256",
        algorithm="HS256",
        headers={"kid": key.kid},
    )

    with pytest.raises(UnauthenticatedError):
        await verifier(Fetcher(key)).verify(forged)


@pytest.mark.parametrize("token", ["", "not-a-jwt", "a.b.c"])
async def test_garbage_is_rejected(key: TestKey, token: str) -> None:
    with pytest.raises(UnauthenticatedError):
        await verifier(Fetcher(key)).verify(token)


async def test_the_jwks_is_cached_for_at_most_ten_minutes(key: TestKey) -> None:
    fetch, clock = Fetcher(key), Clock()
    subject = verifier(fetch, clock)

    await subject.verify(key.token())
    clock.now += 599
    await subject.verify(key.token())
    assert fetch.calls == 1

    clock.now += 2
    await subject.verify(key.token())
    assert fetch.calls == 2


async def test_a_rotated_key_is_picked_up_without_waiting_for_the_ttl(key: TestKey) -> None:
    fetch, clock = Fetcher(key), Clock()
    subject = verifier(fetch, clock)
    await subject.verify(key.token())

    rotated = TestKey("key-2")
    fetch.keys.append(rotated)
    clock.now += 60  # past the refresh cool-down, well inside the TTL

    claims = await subject.verify(rotated.token())

    assert claims["role"] == "authenticated"
    assert fetch.calls == 2


async def test_unknown_key_ids_cannot_force_a_download_per_request(key: TestKey) -> None:
    fetch, clock = Fetcher(key), Clock()
    subject = verifier(fetch, clock)
    stranger = TestKey("unknown")

    for _ in range(5):
        with pytest.raises(UnauthenticatedError):
            await subject.verify(stranger.token())

    assert fetch.calls == 1


async def test_an_unreachable_jwks_is_a_503_not_a_401(key: TestKey) -> None:
    async def broken(_url: str) -> dict[str, Any]:
        raise OSError

    subject = JwksTokenVerifier(
        jwks_url=URL, issuer=ISSUER, audience=AUDIENCE, fetch=broken, clock=Clock()
    )

    with pytest.raises(UnavailableError):
        await subject.verify(key.token())
