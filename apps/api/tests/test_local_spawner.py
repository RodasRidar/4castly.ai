"""`JOB_RUNNER=local`: the API starts the worker as a detached subprocess, not a Modal call."""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from uuid import uuid4

import pytest

from api.adapters.local_spawner import LocalJobSpawner
from api.main import create_app
from api.settings import Settings

SCRIPT = (
    "import os, pathlib, sys, time; time.sleep(0.4); print('hello from the worker', flush=True); "
    "pathlib.Path('ran.txt').write_text(' '.join(sys.argv[1:]) + '|' + os.getcwd())"
)


def spawner(tmp_path: Path, script: str = SCRIPT) -> LocalJobSpawner:
    return LocalJobSpawner(
        worker_dir=tmp_path,
        log_dir=tmp_path / "logs",
        command=(sys.executable, "-c", script),
    )


async def test_it_starts_the_worker_in_its_own_directory_with_the_kind_and_job_id(
    tmp_path: Path,
) -> None:
    job = uuid4()
    subject = spawner(tmp_path)

    await subject.spawn("digest", job)
    await subject.wait_idle()

    ran = (tmp_path / "ran.txt").read_text()
    assert ran == f"run digest {job}|{tmp_path.resolve()}"


async def test_spawning_returns_before_the_job_finishes(tmp_path: Path) -> None:
    subject = spawner(tmp_path)

    started = time.monotonic()
    await subject.spawn("forecast", uuid4())
    elapsed = time.monotonic() - started

    assert elapsed < 0.3  # the script sleeps 0.4 s: the API request must not wait for it
    await subject.wait_idle()


async def test_the_workers_output_goes_to_a_log_file_per_job(tmp_path: Path) -> None:
    job = uuid4()
    subject = spawner(tmp_path)

    await subject.spawn("digest", job)
    await subject.wait_idle()

    log = tmp_path / "logs" / f"worker-digest-{job}.log"
    assert "hello from the worker" in log.read_text()


async def test_a_failing_worker_does_not_raise_in_the_api(tmp_path: Path) -> None:
    subject = spawner(tmp_path, "import sys; sys.exit(3)")

    await subject.spawn("digest", uuid4())
    await subject.wait_idle()  # the exit code is logged; the job row is the source of truth


async def test_unknown_kinds_are_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="unknown job kind"):
        await spawner(tmp_path).spawn("backfill", uuid4())


async def test_a_missing_executable_raises_so_the_caller_can_log_it(tmp_path: Path) -> None:
    subject = LocalJobSpawner(
        worker_dir=tmp_path, log_dir=tmp_path / "logs", command=("/no/such/binary",)
    )

    with pytest.raises(OSError):  # noqa: PT011 - FileNotFoundError or PermissionError by platform
        await subject.spawn("digest", uuid4())


async def test_idle_is_immediate_when_nothing_runs(tmp_path: Path) -> None:
    await asyncio.wait_for(spawner(tmp_path).wait_idle(), timeout=1)


class TestWiring:
    def test_job_runner_local_selects_the_local_spawner(self) -> None:
        app = create_app(Settings(_env_file=None, job_runner="local"))

        assert type(app.state.container.spawner).__name__ == "LocalJobSpawner"

    def test_the_default_is_modal(self) -> None:
        app = create_app(Settings(_env_file=None))

        assert type(app.state.container.spawner).__name__ == "ModalJobSpawner"

    def test_the_worker_directory_defaults_to_the_sibling_project(self) -> None:
        app = create_app(Settings(_env_file=None, job_runner="local"))

        worker_dir = app.state.container.spawner.worker_dir
        assert (worker_dir / "pyproject.toml").exists()
        assert worker_dir.name == "worker"
