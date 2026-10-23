"""Modal entry points. Everything of substance lives in `bootstrap.Worker`; these only load the
container's settings, parse ids and delegate.

    modal deploy -m worker.modal_app --env dev      # or --env prod

Secrets: a Modal secret named `castly-worker` per environment holding DATABASE_URL (app_worker, via
the pooler), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, API_READY_URL and the
AXIOM_* values. The API starts jobs with `modal.Function.from_name("castly-worker", "run_digest")
.spawn(job_id)` after inserting the `jobs` row.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from uuid import UUID

import httpx2
import modal
import telemetry

from worker.application.keepalive import keepalive
from worker.bootstrap import Worker
from worker.settings import get_settings

APP_NAME = "castly-worker"
FUNCTION_NAMES = ("run_digest", "run_forecast", "respawn_stuck", "keepalive_daily")
LOCAL_SOURCES = ("worker", "inventory", "telemetry")
REQUIREMENTS = Path(__file__).resolve().parents[2] / "requirements-modal.txt"

# R2: up to three attempts with exponential backoff; JobRunner caps attempts the same way.
RETRIES = modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0, max_delay=60.0)
RESPAWN_EVERY_MINUTES = 5  # R3 (Vercel Hobby crons run at most daily)
KEEPALIVE_CRON = "0 12 * * *"  # R14, UTC
API_CHECK_TIMEOUT_SECONDS = 10.0

app = modal.App(APP_NAME)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install(requirements=[str(REQUIREMENTS)])
    .env({"HF_HOME": "/models/huggingface"})
    .add_local_python_source(*LOCAL_SOURCES)
)
secret = modal.Secret.from_name(APP_NAME)
# TimesFM weights are downloaded once into this volume, never per run (plan 13).
models = modal.Volume.from_name("castly-models", create_if_missing=True)


@lru_cache
def get_worker() -> Worker:
    """Built once per container: logging, then the adapters."""
    settings = get_settings()
    telemetry.configure_logging(
        service="worker",
        environment=settings.environment,
        version=settings.service_version,
        level=settings.log_level,
    )
    return Worker.from_settings(settings)


@app.function(
    image=image, secrets=[secret], volumes={"/models": models}, retries=RETRIES, timeout=15 * 60,
    memory=2048,
)  # fmt: skip
def run_digest(job_id: str) -> str:
    return get_worker().run_digest(UUID(job_id))


@app.function(
    image=image, secrets=[secret], volumes={"/models": models}, retries=RETRIES, timeout=30 * 60,
    cpu=2.0, memory=4096,
)  # fmt: skip
def run_forecast(job_id: str) -> str:
    return get_worker().run_forecast(UUID(job_id))


class ModalSpawner:
    """`JobSpawner` that starts the Modal function of the job's kind."""

    def spawn(self, kind: str, job_id: UUID) -> None:
        functions = {"digest": run_digest, "forecast": run_forecast}
        if kind not in functions:
            message = f"unknown job kind: {kind}"
            raise ValueError(message)
        functions[kind].spawn(str(job_id))


@app.function(
    image=image, secrets=[secret], schedule=modal.Period(minutes=RESPAWN_EVERY_MINUTES), timeout=120
)
def respawn_stuck() -> dict[str, int]:
    report = get_worker().respawn_stuck(ModalSpawner())
    return {"spawned": report.spawned, "failed": report.failed, "errors": report.errors}


@app.function(image=image, secrets=[secret], schedule=modal.Cron(KEEPALIVE_CRON), timeout=60)
def keepalive_daily() -> dict[str, bool | None]:
    worker = get_worker()
    url = get_settings().api_ready_url

    def api_ready() -> bool:
        return httpx2.get(url, timeout=API_CHECK_TIMEOUT_SECONDS).status_code == httpx2.codes.OK

    result = keepalive(worker.ping_database, api_ready if url else None)
    return {"database_ok": result.database_ok, "api_ok": result.api_ok}
