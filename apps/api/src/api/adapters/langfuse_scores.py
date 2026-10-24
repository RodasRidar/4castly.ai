"""Feedback as Langfuse scores (public API, basic auth with the project keys).

The score id is derived from the message and the voter, so changing a vote replaces the score and
clearing it deletes the same one.
"""

from __future__ import annotations

from uuid import UUID

import httpx

TIMEOUT_SECONDS = 5.0
SCORE_NAME = "user_feedback"


class LangfuseScores:
    def __init__(
        self,
        *,
        host: str,
        public_key: str,
        secret_key: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=host.rstrip("/"),
            auth=(public_key, secret_key),
            timeout=TIMEOUT_SECONDS,
            transport=transport,
        )

    async def score(
        self, trace_id: str, message_id: UUID, user_id: UUID, value: str | None
    ) -> None:
        score_id = f"feedback-{message_id}-{user_id}"
        if value is None:
            response = await self._client.delete(f"/api/public/scores/{score_id}")
            if response.status_code == 404:  # noqa: PLR2004 - nothing to clear
                return
        else:
            response = await self._client.post(
                "/api/public/scores",
                json={
                    "id": score_id,
                    "traceId": trace_id,
                    "name": SCORE_NAME,
                    "value": value,
                    "dataType": "CATEGORICAL",
                },
            )
        response.raise_for_status()
