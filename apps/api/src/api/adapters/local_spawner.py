"""Development job runner: start the worker as a detached subprocess instead of calling Modal.

`uv run --project apps/worker python -m worker.local run <kind> <job_id>` runs the same handlers as
the Modal functions, against the same `jobs` row. The API never waits for the job: it returns once
the process is started, and the child's output goes to one log file per job.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from pathlib import Path
from uuid import UUID

import structlog

KINDS = ("digest", "forecast")


class LocalJobSpawner:
    def __init__(
        self,
        *,
        worker_dir: Path,
        log_dir: Path | None = None,
        command: Sequence[str] | None = None,
    ) -> None:
        self.worker_dir = worker_dir.resolve()
        self._log_dir = log_dir or self.worker_dir / ".logs"
        self._command = tuple(
            command
            or ("uv", "run", "--project", str(self.worker_dir), "python", "-m", "worker.local")
        )
        self._running: set[asyncio.Task[None]] = set()

    async def spawn(self, kind: str, job_id: UUID) -> None:
        if kind not in KINDS:
            message = f"unknown job kind: {kind}"
            raise ValueError(message)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        log_path = self._log_dir / f"worker-{kind}-{job_id}.log"
        with log_path.open("ab") as log:
            process = await asyncio.create_subprocess_exec(
                *self._command,
                "run",
                kind,
                str(job_id),
                cwd=self.worker_dir,
                stdout=log,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,  # survives an API reload; not tied to its process group
            )
        structlog.get_logger().info(
            "worker.local_started", kind=kind, job_id=str(job_id), pid=process.pid
        )
        task = asyncio.create_task(self._reap(process, kind, job_id))
        self._running.add(task)
        task.add_done_callback(self._running.discard)

    @staticmethod
    async def _reap(process: asyncio.subprocess.Process, kind: str, job_id: UUID) -> None:
        code = await process.wait()
        structlog.get_logger().info(
            "worker.local_exited", kind=kind, job_id=str(job_id), exit_code=code
        )

    async def wait_idle(self) -> None:
        """Wait for every started job to exit (tests, graceful shutdown)."""
        if self._running:
            await asyncio.gather(*self._running)
