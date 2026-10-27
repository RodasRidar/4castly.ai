"""Run one job in this process, for development: `python -m worker.local run digest <job_id>`.

The API starts this as a subprocess when `JOB_RUNNER=local`, in place of the Modal function.
Same handlers, same job rows: only who calls them changes.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from typing import Protocol
from uuid import UUID

import structlog
import telemetry

from worker.bootstrap import Worker
from worker.settings import get_settings

_OK_OUTCOMES = {"succeeded", "skipped", "cancelled"}


class JobWorker(Protocol):
    def run_digest(self, job_id: UUID) -> str: ...

    def run_forecast(self, job_id: UUID) -> str: ...


def _default_worker() -> JobWorker:
    settings = get_settings()
    telemetry.configure_logging(
        service="worker",
        environment=settings.environment,
        version=settings.service_version,
        level=settings.log_level,
    )
    return Worker.from_settings(settings)


def main(
    argv: Sequence[str] | None = None, *, factory: Callable[[], JobWorker] | None = None
) -> int:
    parser = argparse.ArgumentParser(prog="worker.local", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="run one job to completion")
    run.add_argument("kind", choices=("digest", "forecast"))
    run.add_argument("job_id", type=UUID)
    args = parser.parse_args(argv)

    log = structlog.get_logger()
    try:
        worker = (factory or _default_worker)()
        handler = worker.run_digest if args.kind == "digest" else worker.run_forecast
        outcome = handler(args.job_id)
    except Exception as error:
        log.error(
            "local.job_crashed", kind=args.kind, job_id=str(args.job_id), error=type(error).__name__
        )
        return 1
    log.info("local.job_finished", kind=args.kind, job_id=str(args.job_id), outcome=outcome)
    return 0 if outcome in _OK_OUTCOMES else 1


if __name__ == "__main__":
    sys.exit(main())
