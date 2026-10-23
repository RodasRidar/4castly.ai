"""Composition root: wires the ports to their adapters. Only entry points call this."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from uuid import UUID

import anthropic
from sqlalchemy import Engine

from worker.adapters.db.digest import SqlDigestRepository
from worker.adapters.db.engine import create_worker_engine
from worker.adapters.db.jobs import SqlJobRepository
from worker.adapters.db.runs import SqlRunRepository
from worker.adapters.forecasting import StatsForecastBaseline
from worker.adapters.ingestion.inspector import SheetsInspector
from worker.adapters.ingestion.kardex_excel import KardexExcelSource
from worker.adapters.ingestion.kardex_scan import KardexScanner
from worker.adapters.ingestion.plan_matcher import DeterministicPlanProposer
from worker.adapters.ingestion.tabular import TabularSalesReader
from worker.adapters.llm.anthropic_plan import AnthropicPlanProposer
from worker.adapters.storage.supabase import SupabaseFileStore
from worker.application.digest import DigestJob
from worker.application.forecast import ForecastJob
from worker.application.jobs import JobRunner
from worker.application.respawn import RespawnReport, RespawnStuckJobs
from worker.ports.file_store import FileStore
from worker.ports.forecaster import Forecaster
from worker.ports.job_spawner import JobSpawner
from worker.ports.plan_proposer import PlanProposer
from worker.settings import Settings


class Worker:
    """Everything a worker entry point needs, built once per container."""

    def __init__(  # noqa: PLR0913 - explicit dependencies, injectable in tests
        self,
        engine: Engine,
        *,
        store: FileStore,
        proposer: PlanProposer,
        forecaster: Forecaster,
        stale_after: timedelta = timedelta(minutes=10),
        queued_after: timedelta = timedelta(minutes=2),
        max_attempts: int = 3,
        today: Callable[[], date] = date.today,
    ) -> None:
        self.engine = engine
        self.jobs = SqlJobRepository(engine, stale_after=stale_after, max_attempts=max_attempts)
        self.digest_repo = SqlDigestRepository(engine)
        self.run_repo = SqlRunRepository(engine, today=today)
        self._queued_after = queued_after
        self._digest = DigestJob(
            self.digest_repo,
            store,
            SheetsInspector(),
            proposer,
            TabularSalesReader(),
            KardexScanner(),
        )
        self._forecast = ForecastJob(
            self.run_repo,
            store,
            TabularSalesReader(),
            lambda path: KardexExcelSource(Path(path)).read_movements(),
            forecaster,
        )
        self._digest_runner = JobRunner(self.jobs, self.digest_repo, max_attempts=max_attempts)
        self._forecast_runner = JobRunner(self.jobs, self.run_repo, max_attempts=max_attempts)

    def run_digest(self, job_id: UUID) -> str:
        return self._digest_runner.run(job_id, self._digest)

    def run_forecast(self, job_id: UUID) -> str:
        return self._forecast_runner.run(job_id, self._forecast)

    def respawn_stuck(self, spawner: JobSpawner) -> RespawnReport:
        return RespawnStuckJobs(
            self.jobs, self.digest_repo, spawner, queued_after=self._queued_after
        )()

    @classmethod
    def from_settings(cls, settings: Settings) -> Worker:
        engine = create_worker_engine(settings.database_url, pool_size=settings.db_pool_size)
        matcher = DeterministicPlanProposer()
        proposer: PlanProposer = (
            AnthropicPlanProposer(anthropic.Anthropic(api_key=settings.anthropic_api_key), matcher)
            if settings.anthropic_api_key
            else matcher
        )
        return cls(
            engine,
            store=SupabaseFileStore(settings.supabase_url, settings.supabase_service_role_key),
            proposer=proposer,
            # Weekly series are short (tens of weeks): no yearly season, or AutoETS cannot fit.
            forecaster=StatsForecastBaseline("auto_ets", season_length=1),
            stale_after=timedelta(minutes=settings.stale_after_minutes),
            queued_after=timedelta(minutes=settings.queued_after_minutes),
            max_attempts=settings.max_attempts,
        )
