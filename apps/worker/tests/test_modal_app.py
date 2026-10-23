"""The Modal entry points: thin wrappers over the Worker, configured as the plan requires."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from worker import modal_app
from worker.application.respawn import RespawnReport
from worker.settings import Settings

ROOT = Path(__file__).resolve().parents[1]


class FakeWorker:
    def __init__(self) -> None:
        self.digested: list[UUID] = []
        self.forecast: list[UUID] = []
        self.respawned = 0
        self.pings = 0

    def run_digest(self, job_id: UUID) -> str:
        self.digested.append(job_id)
        return "succeeded"

    def run_forecast(self, job_id: UUID) -> str:
        self.forecast.append(job_id)
        return "succeeded"

    def respawn_stuck(self, spawner: object) -> RespawnReport:
        self.respawned += 1
        return RespawnReport(spawned=2)

    def ping_database(self) -> None:
        self.pings += 1


@pytest.fixture
def worker(monkeypatch: pytest.MonkeyPatch) -> FakeWorker:
    fake = FakeWorker()
    monkeypatch.setattr(modal_app, "get_worker", lambda: fake)
    return fake


def test_the_four_functions_exist() -> None:
    assert modal_app.FUNCTION_NAMES == (
        "run_digest",
        "run_forecast",
        "respawn_stuck",
        "keepalive_daily",
    )
    for name in modal_app.FUNCTION_NAMES:
        assert hasattr(modal_app, name)


def test_modal_retries_plus_the_first_try_match_the_attempt_cap() -> None:
    assert modal_app.RETRIES.max_retries + 1 == Settings().max_attempts  # R2: three attempts
    assert modal_app.RETRIES.backoff_coefficient > 1  # exponential backoff


def test_the_respawn_sweep_runs_well_inside_the_stale_window() -> None:
    assert modal_app.RESPAWN_EVERY_MINUTES == 5  # R3
    assert Settings().stale_after_minutes > modal_app.RESPAWN_EVERY_MINUTES


def test_keepalive_runs_once_a_day() -> None:
    assert modal_app.KEEPALIVE_CRON == "0 12 * * *"  # R14


def test_job_functions_delegate_with_a_parsed_uuid(worker: FakeWorker) -> None:
    job = uuid4()

    assert modal_app.run_digest.local(str(job)) == "succeeded"
    assert modal_app.run_forecast.local(str(job)) == "succeeded"

    assert worker.digested == [job]
    assert worker.forecast == [job]


def test_a_malformed_job_id_is_rejected_before_any_work(worker: FakeWorker) -> None:
    with pytest.raises(ValueError, match=r"UUID|uuid|hexadecimal"):
        modal_app.run_digest.local("not-a-uuid")

    assert worker.digested == []


def test_the_sweep_returns_a_summary(worker: FakeWorker) -> None:
    assert modal_app.respawn_stuck.local() == {"spawned": 2, "failed": 0, "errors": 0}
    assert worker.respawned == 1


def test_keepalive_touches_the_database(
    worker: FakeWorker, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(modal_app, "get_settings", lambda: Settings(api_ready_url=""))

    result = modal_app.keepalive_daily.local()

    assert result == {"database_ok": True, "api_ok": None}
    assert worker.pings == 1


def test_the_spawner_starts_the_function_of_the_jobs_kind(monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[tuple[str, str]] = []

    class Fn:
        def __init__(self, name: str) -> None:
            self.name = name

        def spawn(self, job_id: str) -> None:
            started.append((self.name, job_id))

    monkeypatch.setattr(modal_app, "run_digest", Fn("digest"))
    monkeypatch.setattr(modal_app, "run_forecast", Fn("forecast"))
    job = uuid4()

    modal_app.ModalSpawner().spawn("forecast", job)
    modal_app.ModalSpawner().spawn("digest", job)

    assert started == [("forecast", str(job)), ("digest", str(job))]


def test_an_unknown_job_kind_cannot_be_spawned() -> None:
    with pytest.raises(ValueError, match="kind"):
        modal_app.ModalSpawner().spawn("mystery", uuid4())


class TestImage:
    def test_the_pinned_requirements_match_the_lockfile(self) -> None:
        if shutil.which("uv") is None:
            pytest.skip("uv not installed")
        command = [
            "uv", "export", "--frozen", "--no-dev", "--no-hashes", "--no-emit-project",
            "--no-emit-package", "castly-inventory", "--no-emit-package", "castly-telemetry",
            "--no-emit-package", "castly-pgtest",
        ]  # fmt: skip
        exported = subprocess.run(  # noqa: S603
            command, cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout

        assert (ROOT / "requirements-modal.txt").read_text() == exported, (
            "run `make modal-requirements`"
        )

    def test_local_only_and_dev_dependencies_stay_out_of_the_image(self) -> None:
        lines = (ROOT / "requirements-modal.txt").read_text().lower().splitlines()
        packages = {line.split("==")[0] for line in lines if line and line[0] not in "# "}

        for forbidden in ("timesfm", "torch", "mlx", "pytest", "castly-pgtest"):
            assert forbidden not in packages, forbidden
        assert {"polars", "statsforecast", "sqlalchemy", "anthropic"} <= packages

    def test_the_shared_packages_ship_as_source(self) -> None:
        assert set(modal_app.LOCAL_SOURCES) == {"worker", "inventory", "telemetry"}
