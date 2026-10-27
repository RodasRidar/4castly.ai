"""`python -m worker.local run <kind> <job_id>`: run one job in this process (development)."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from worker.local import main


class FakeWorker:
    def __init__(self, outcome: str = "succeeded", boom: Exception | None = None) -> None:
        self.outcome, self.boom, self.calls = outcome, boom, []

    def run_digest(self, job_id: UUID) -> str:
        return self._run("digest", job_id)

    def run_forecast(self, job_id: UUID) -> str:
        return self._run("forecast", job_id)

    def _run(self, kind: str, job_id: UUID) -> str:
        self.calls.append((kind, job_id))
        if self.boom:
            raise self.boom
        return self.outcome


def run(argv: list[str], worker: FakeWorker) -> int:
    return main(argv, factory=lambda: worker)


@pytest.mark.parametrize("kind", ["digest", "forecast"])
def test_runs_the_job_of_the_given_kind(kind: str) -> None:
    worker, job = FakeWorker(), uuid4()

    code = run(["run", kind, str(job)], worker)

    assert code == 0
    assert worker.calls == [(kind, job)]


@pytest.mark.parametrize(("outcome", "code"), [
    ("succeeded", 0), ("skipped", 0), ("cancelled", 0), ("failed", 1),
])  # fmt: skip
def test_the_exit_code_follows_the_outcome(outcome: str, code: int) -> None:
    assert run(["run", "digest", str(uuid4())], FakeWorker(outcome)) == code


def test_an_unexpected_error_is_a_failure_exit_not_a_traceback() -> None:
    worker = FakeWorker(boom=RuntimeError("postgres://secret@db"))

    assert run(["run", "forecast", str(uuid4())], worker) == 1


@pytest.mark.parametrize(
    "argv", [[], ["run"], ["run", "nope", str(uuid4())], ["run", "digest", "not-a-uuid"]]
)
def test_bad_usage_is_exit_two(argv: list[str]) -> None:
    with pytest.raises(SystemExit) as raised:
        run(argv, FakeWorker())

    assert raised.value.code == 2
