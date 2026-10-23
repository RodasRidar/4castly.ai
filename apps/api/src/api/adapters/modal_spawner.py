"""Starts the Modal functions the worker deploys (`apps/worker/src/worker/modal_app.py`)."""

from __future__ import annotations

from uuid import UUID

FUNCTION_BY_KIND = {"digest": "run_digest", "forecast": "run_forecast"}


class ModalJobSpawner:
    def __init__(self, *, app_name: str = "castly-worker", environment: str | None = None) -> None:
        self._app_name = app_name
        self._environment = environment or None

    async def spawn(self, kind: str, job_id: UUID) -> None:
        import modal  # noqa: PLC0415 - heavy import, only needed when a job is started

        function = modal.Function.from_name(
            self._app_name, FUNCTION_BY_KIND[kind], environment_name=self._environment
        )
        await function.spawn.aio(str(job_id))
