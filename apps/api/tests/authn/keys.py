"""Signing keys and tokens for tests: a local JWKS stands in for Supabase's."""

from __future__ import annotations

import json
import time
from collections.abc import Mapping
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

ISSUER = "http://127.0.0.1:54321/auth/v1"
AUDIENCE = "authenticated"


class TestKey:
    """One RSA key pair with a key id."""

    __test__ = False

    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def jwk(self) -> dict[str, Any]:
        public = json.loads(RSAAlgorithm.to_jwk(self.private.public_key()))
        return {**public, "kid": self.kid, "alg": "RS256", "use": "sig"}

    def token(self, claims: Mapping[str, Any] | None = None, *, algorithm: str = "RS256") -> str:
        now = int(time.time())
        payload = {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "00000000-0000-0000-0000-0000000000aa",
            "iat": now,
            "exp": now + 3600,
            "role": "authenticated",
            **(claims or {}),
        }
        return jwt.encode(payload, self.private, algorithm=algorithm, headers={"kid": self.kid})


def jwks(*keys: TestKey) -> dict[str, Any]:
    return {"keys": [key.jwk() for key in keys]}
