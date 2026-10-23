"""The forecast job (plan 6c, 12 R1-R5): clean the confirmed data, forecast, apply the formulas and
publish the run in one transaction. A recalculation reuses the stored demand instead of the file."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import inventory as inv

from worker.application.demand import (
    WeeklyDemand,
    demand_from_movements,
    demand_from_sales,
)
from worker.application.forecasting import forecast_product, reliability
from worker.application.jobs import JobContext, JobOutcome
from worker.domain.documents import SOURCE_KARDEX
from worker.domain.errors import PermanentJobError
from worker.domain.jobs import STAGE_CALCULATING_FORECAST, STAGE_CLEANING_DATA
from worker.domain.models import Movement
from worker.domain.results import (
    ProductDemand,
    ProductOverride,
    ProductRun,
    RunResult,
)
from worker.ports.file_store import FileStore
from worker.ports.forecaster import Forecaster
from worker.ports.run_repository import RunRepository
from worker.ports.sales_reader import SalesReader

PROGRESS_EVERY = 5


@dataclass(frozen=True)
class Defaults:
    """Used for whatever the user did not answer; the run records which ones (shown in results)."""

    lead_time_days: int = 30
    target_coverage_weeks: int = 4
    horizon_weeks: int = 12


class ForecastJob:
    """Handler for `forecast` jobs."""

    def __init__(  # noqa: PLR0913, PLR0917 - the ports the forecast depends on
        self,
        repo: RunRepository,
        store: FileStore,
        sales_reader: SalesReader,
        movements: Callable[[Path], Sequence[Movement]],
        forecaster: Forecaster,
        defaults: Defaults | None = None,
    ) -> None:
        self._repo = repo
        self._store = store
        self._sales = sales_reader
        self._movements = movements
        self._forecaster = forecaster
        self._defaults = defaults or Defaults()

    def __call__(self, ctx: JobContext) -> JobOutcome:
        claim = ctx.claim
        if self._repo.run_exists_for_job(claim):  # a retry after publishing: nothing left to do
            return JobOutcome.SUCCEEDED
        self._repo.set_conversation_stage(claim, "calculating")
        previous = self._repo.run_params(claim)
        ctx.stage(STAGE_CLEANING_DATA)
        if claim.params.get("recalculate"):
            weekly = self._stored_demand(claim, previous)
        else:
            weekly = self._clean(ctx)
        params = self._parameters(
            claim.params, previous if claim.params.get("recalculate") else None
        )
        params["stock_known"] = all(p.current_stock is not None for p in weekly.products)
        params["data_until"] = weekly.data_until.isoformat()
        if not params["stock_known"] and claim.params.get("had_stockouts") is None:
            params["defaults_used"] = [*params["defaults_used"], "stockout_censoring"]

        overrides = self._repo.load_overrides(claim)
        volumes = inv.classify_abc(
            inv.AbcItem(p.code, p.uom, sum(pt.demand for pt in p.points)) for p in weekly.products
        )
        total = len(weekly.products)
        ctx.stage(STAGE_CALCULATING_FORECAST, processed=0, total=total)
        runs: list[ProductRun] = []
        for index, product in enumerate(weekly.products, start=1):
            runs.append(
                self._product_run(
                    product, params, weekly.data_until, overrides.get(product.code), volumes
                )
            )
            if index % PROGRESS_EVERY == 0 and index < total:
                ctx.stage(STAGE_CALCULATING_FORECAST, processed=index, total=total)
        ctx.stage(STAGE_CALCULATING_FORECAST, processed=total, total=total)
        ctx.checkpoint()

        self._repo.publish_run(
            claim,
            RunResult(weekly.data_until, params["horizon_weeks"], "weekly", params, tuple(runs)),
        )
        return JobOutcome.SUCCEEDED

    # -- data ----------------------------------------------------------------------------------
    def _clean(self, ctx: JobContext) -> WeeklyDemand:
        confirmed = self._repo.load_confirmed(ctx.claim)
        if confirmed is None:
            message = "the conversation has no confirmed plan"
            raise PermanentJobError(message)
        upload, document = confirmed
        with TemporaryDirectory(prefix="forecast-") as scratch:
            try:
                path = self._store.fetch(upload.storage_path, Path(scratch))
            except FileNotFoundError as error:
                message = "the uploaded object is missing from storage"
                raise PermanentJobError(message) from error
            if document.source_kind == SOURCE_KARDEX:
                weekly = demand_from_movements(self._movements(path))
            else:
                if document.plan is None:
                    message = "the confirmed document has no plan to execute"
                    raise PermanentJobError(message)
                weekly = demand_from_sales(
                    self._sales.read(path, upload.file_name, document.plan).frame
                )
        ctx.checkpoint()
        self._repo.save_demand(ctx.claim, upload, weekly.products)
        return weekly

    def _stored_demand(self, claim: Any, previous: dict[str, Any] | None) -> WeeklyDemand:
        if previous is None or "data_until" not in previous:
            message = "there is no previous run to recalculate"
            raise PermanentJobError(message)
        products = self._repo.load_demand(claim)
        if not products:
            message = "the stored demand is empty"
            raise PermanentJobError(message)
        return WeeklyDemand(tuple(products), date.fromisoformat(previous["data_until"]))

    # -- parameters ----------------------------------------------------------------------------
    def _parameters(self, job: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
        base = previous or {}
        defaults_used: list[str] = list(base.get("defaults_used", [])) if previous else []

        def pick(key: str, default: Any, label: str) -> Any:
            if job.get(key) is not None:
                if label in defaults_used:
                    defaults_used.remove(label)
                return job[key]
            if previous is not None and key in base:
                return base[key]
            if label not in defaults_used:
                defaults_used.append(label)
            return default

        d = self._defaults
        return {
            "horizon_weeks": job.get("horizon_weeks")
            or base.get("horizon_weeks")
            or d.horizon_weeks,
            "granularity": "weekly",
            "lead_time_days": pick("lead_time_days", d.lead_time_days, "lead_time"),
            "target_coverage_weeks": pick(
                "target_coverage_weeks", d.target_coverage_weeks, "target_coverage"
            ),
            "risk_thresholds": job.get("risk_thresholds")
            or base.get("risk_thresholds")
            or {"critical_margin_weeks": 0.0, "medium_margin_weeks": 2.0},
            "assistant_style": job.get("assistant_style") or base.get("assistant_style") or "brief",
            "defaults_used": defaults_used,
        }

    # -- one product ---------------------------------------------------------------------------
    def _product_run(
        self,
        product: ProductDemand,
        params: dict[str, Any],
        data_until: date,
        override: ProductOverride | None,
        abc: dict[str, inv.AbcClass],
    ) -> ProductRun:
        horizon = params["horizon_weeks"]
        forecasted = forecast_product(product, horizon, self._forecaster)
        lead_days = (override.lead_time_days if override else None) or params["lead_time_days"]
        target = (
            override.target_coverage_weeks
            if override and override.target_coverage_weeks is not None
            else params["target_coverage_weeks"]
        )
        on_order = (override.on_order_qty if override else None) or 0.0
        lead_weeks = inv.lead_time_weeks(lead_days)
        arrivals = {lead_weeks: on_order} if on_order > 0 and lead_weeks <= horizon else {}
        stock = product.current_stock if product.current_stock is not None else 0.0
        analysis = inv.analyze_product(
            inv.ProductInputs(stock, forecasted.demand, lead_days, target, arrivals),
            inv.RiskThresholds(**params["risk_thresholds"]),
        )
        non_censored = sum(not p.censored for p in product.points)
        score = forecasted.backtest
        return ProductRun(
            code=product.code,
            abc_class=abc[product.code].value,
            method=forecasted.method,
            forecaster=forecasted.forecaster,
            forecast_dates=tuple(inv.week_start(data_until, w) for w in range(1, horizon + 1)),
            demand=forecasted.demand,
            analysis=analysis,
            current_stock=stock,
            lead_time_days=lead_days,
            lead_time_overridden=bool(override and override.lead_time_days),
            target_coverage_weeks=target,
            on_order_qty=on_order,
            data_until=data_until,
            reliability=reliability(forecasted.method, score) if score else "low",
            reliability_detail={
                "method": forecasted.method,
                "history_weeks": len(product.points),
                "non_censored_weeks": non_censored,
                "wape_pct": round(score.wape * 100, 1)
                if score and score.wape is not None
                else None,
                "backtest_folds": score.folds if score else 0,
            },
        )
