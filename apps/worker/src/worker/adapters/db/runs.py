"""`RunRepository` in PostgreSQL: demand series, overrides and the atomic publication of a run."""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from datetime import date
from typing import Any
from uuid import UUID

import inventory as inv
from sqlalchemy import Connection, Engine, text

from worker.domain.documents import PlanDocument
from worker.domain.jobs import JobClaim
from worker.domain.results import (
    DemandPoint,
    ProductDemand,
    ProductOverride,
    ProductRun,
    RunResult,
    UploadInfo,
)

_BUY_BEFORE_ACTION = {
    "order_today": "order_today",
    "order_by_week": "order_by_date",
    "no_stockout": "no_stockout",
}
_CHUNK = 20_000


class SqlRunRepository:
    def __init__(self, engine: Engine, *, today: Callable[[], date] = date.today) -> None:
        self._engine = engine
        self._today = today

    # -- reads ---------------------------------------------------------------------------------
    def load_confirmed(self, claim: JobClaim) -> tuple[UploadInfo, PlanDocument] | None:
        with self._engine.connect() as conn:
            row = conn.execute(
                text(
                    "select u.id, u.storage_path, u.file_name, p.plan "
                    "from public.normalization_plans p "
                    "join public.uploads u on u.id = p.upload_id and u.tenant_id = p.tenant_id "
                    "where p.tenant_id = :t and u.conversation_id = :c "
                    "and p.confirmed_at is not null "
                    "order by p.confirmed_at desc limit 1"
                ),
                {"t": claim.tenant_id, "c": claim.conversation_id},
            ).one_or_none()
        if row is None:
            return None
        return UploadInfo(row.id, row.storage_path, row.file_name), PlanDocument.from_dict(row.plan)

    def load_overrides(self, claim: JobClaim) -> dict[str, ProductOverride]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    "select p.code, o.lead_time_days, o.target_coverage_weeks, o.on_order_qty "
                    "from public.product_overrides o join public.products p "
                    "on p.tenant_id = o.tenant_id and p.id = o.product_id where o.tenant_id = :t"
                ),
                {"t": claim.tenant_id},
            ).all()
        return {
            r.code: ProductOverride(
                r.lead_time_days,
                r.target_coverage_weeks,
                float(r.on_order_qty) if r.on_order_qty is not None else None,
            )
            for r in rows
        }

    def run_exists_for_job(self, claim: JobClaim) -> bool:
        with self._engine.connect() as conn:
            return bool(
                conn.execute(
                    text(
                        "select exists (select 1 from public.forecast_runs "
                        "where tenant_id = :t and job_id = :j)"
                    ),
                    {"t": claim.tenant_id, "j": claim.job_id},
                ).scalar()
            )

    def run_params(self, claim: JobClaim) -> dict[str, Any] | None:
        with self._engine.connect() as conn:
            params = conn.execute(
                text(
                    "select params from public.forecast_runs where tenant_id = :t "
                    "and conversation_id = :c and status = 'ready' order by created_at desc limit 1"
                ),
                {"t": claim.tenant_id, "c": claim.conversation_id},
            ).scalar()
        return dict(params) if params is not None else None

    def load_demand(self, claim: JobClaim) -> list[ProductDemand]:
        ids = {"t": claim.tenant_id, "c": claim.conversation_id}
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    "select p.code, p.name, p.uom, d.period, d.demand, d.censored "
                    "from public.demand_series d join public.products p "
                    "on p.tenant_id = d.tenant_id and p.id = d.product_id "
                    "where d.tenant_id = :t and d.upload_id = (select id from public.uploads "
                    "where tenant_id = :t and conversation_id = :c "
                    "order by created_at desc limit 1) "
                    "order by p.code, d.period"
                ),
                ids,
            ).all()
            stock_known = conn.execute(
                text(
                    "select coalesce((params ->> 'stock_known')::boolean, true) "
                    "from public.forecast_runs where tenant_id = :t and conversation_id = :c "
                    "and status = 'ready' order by created_at desc limit 1"
                ),
                ids,
            ).scalar()
            stocks = {
                r.code: float(r.current_stock)
                for r in conn.execute(
                    text(
                        "select p.code, m.current_stock from public.run_product_metrics m "
                        "join public.products p on p.tenant_id = m.tenant_id "
                        "and p.id = m.product_id where m.tenant_id = :t and m.run_id = ("
                        "select id from public.forecast_runs where tenant_id = :t "
                        "and conversation_id = :c and status = 'ready' "
                        "order by created_at desc limit 1)"
                    ),
                    ids,
                )
            }
        grouped: dict[str, list[Any]] = {}
        for r in rows:
            grouped.setdefault(r.code, []).append(r)
        return [
            ProductDemand(
                code,
                items[0].name,
                items[0].uom,
                tuple(DemandPoint(i.period, float(i.demand), i.censored) for i in items),
                stocks.get(code) if stock_known is not False else None,
            )
            for code, items in grouped.items()
        ]

    # -- writes --------------------------------------------------------------------------------
    def set_conversation_stage(self, claim: JobClaim, stage: str) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    "update public.conversations set stage = :s, last_activity_at = now() "
                    "where id = :c and tenant_id = :t"
                ),
                {"s": stage, "c": claim.conversation_id, "t": claim.tenant_id},
            )

    def save_demand(
        self, claim: JobClaim, upload: UploadInfo, products: Sequence[ProductDemand]
    ) -> None:
        with self._engine.begin() as conn:
            ids = {
                r.code: r.id
                for r in conn.execute(
                    text(
                        "insert into public.products (tenant_id, code, name, uom) "
                        "select :t, c, n, u from unnest(cast(:codes as text[]), "
                        "cast(:names as text[]), cast(:uoms as text[])) as x(c, n, u) "
                        "on conflict (tenant_id, code) do update "
                        "set name = excluded.name, uom = excluded.uom returning id, code"
                    ),
                    {
                        "t": claim.tenant_id,
                        "codes": [p.code for p in products],
                        "names": [p.name for p in products],
                        "uoms": [p.uom for p in products],
                    },
                )
            }
            conn.execute(
                text("delete from public.demand_series where tenant_id = :t and upload_id = :u"),
                {"t": claim.tenant_id, "u": upload.upload_id},
            )
            rows = [
                (ids[p.code], point.period, point.demand, point.censored)
                for p in products
                for point in p.points
            ]
            for start in range(0, len(rows), _CHUNK):
                chunk = rows[start : start + _CHUNK]
                conn.execute(
                    text(
                        "insert into public.demand_series "
                        "(tenant_id, product_id, freq, period, demand, censored, upload_id) "
                        "select :t, pid, 'weekly', per, dem, cen, :u from unnest("
                        "cast(:pids as uuid[]), cast(:periods as date[]), "
                        "cast(:demand as float8[]), cast(:censored as boolean[])) "
                        "as x(pid, per, dem, cen) "
                        "on conflict (tenant_id, product_id, freq, period) do update set "
                        "demand = excluded.demand, censored = excluded.censored, "
                        "upload_id = excluded.upload_id"
                    ),
                    {
                        "t": claim.tenant_id,
                        "u": upload.upload_id,
                        "pids": [r[0] for r in chunk],
                        "periods": [r[1] for r in chunk],
                        "demand": [r[2] for r in chunk],
                        "censored": [r[3] for r in chunk],
                    },
                )

    def publish_run(self, claim: JobClaim, result: RunResult) -> UUID:
        with self._engine.begin() as conn:
            run_id = conn.execute(
                text(
                    "insert into public.forecast_runs (tenant_id, conversation_id, job_id, status, "
                    "data_until, horizon_weeks, granularity, params) values "
                    "(:t, :c, :j, 'building', :du, :h, :g, cast(:params as jsonb)) returning id"
                ),
                {
                    "t": claim.tenant_id,
                    "c": claim.conversation_id,
                    "j": claim.job_id,
                    "du": result.data_until,
                    "h": result.horizon_weeks,
                    "g": result.granularity,
                    "params": json.dumps(result.params),
                },
            ).scalar_one()
            product_ids = {
                r.code: r.id
                for r in conn.execute(
                    text("select id, code from public.products where tenant_id = :t"),
                    {"t": claim.tenant_id},
                )
            }
            forecast_rows = self._forecast_rows(claim, run_id, product_ids, result)
            conn.execute(
                text(
                    "insert into public.forecasts (tenant_id, product_id, run_id, job_id, horizon, "
                    "p10, p50, p90, model) values (:t, :p, :r, :j, :h, :p10, :p50, :p90, :m)"
                ),
                forecast_rows,
            )
            conn.execute(
                text(self._METRICS_SQL),
                [self._metric_row(claim, run_id, product_ids, p, result) for p in result.products],
            )
            conn.execute(
                text(
                    "update public.forecast_runs set status = 'superseded' where tenant_id = :t "
                    "and conversation_id = :c and status = 'ready' and id <> :r"
                ),
                {"t": claim.tenant_id, "c": claim.conversation_id, "r": run_id},
            )
            conn.execute(
                text(
                    "update public.forecast_runs set status = 'ready' "
                    "where id = :r and tenant_id = :t"
                ),
                {"r": run_id, "t": claim.tenant_id},
            )
            conn.execute(
                text(
                    "update public.conversations set stage = 'ready', current_run_id = :r, "
                    "last_activity_at = now() where id = :c and tenant_id = :t"
                ),
                {"r": run_id, "c": claim.conversation_id, "t": claim.tenant_id},
            )
            self._log_event(conn, claim, run_id, len(result.products), len(forecast_rows))
        return run_id

    # -- helpers -------------------------------------------------------------------------------
    @staticmethod
    def _forecast_rows(
        claim: JobClaim, run_id: UUID, product_ids: dict[str, UUID], result: RunResult
    ) -> list[dict[str, Any]]:
        return [
            {
                "t": claim.tenant_id,
                "p": product_ids[p.code],
                "r": run_id,
                "j": claim.job_id,
                "h": day,
                "p10": p.demand.low[i],
                "p50": p.demand.expected[i],
                "p90": p.demand.high[i],
                "m": p.forecaster,
            }
            for p in result.products
            for i, day in enumerate(p.forecast_dates)
        ]

    _METRICS_SQL = (
        "insert into public.run_product_metrics (run_id, product_id, tenant_id, abc_class, "
        "typical_demand_low, typical_demand_expected, typical_demand_high, current_stock, "
        "coverage_weeks_lower, coverage_weeks_expected, coverage_weeks_upper, risk, stockout_date, "
        "suggested_qty_low, suggested_qty_high, suggested_truncated, buy_before_action, "
        "buy_before_date, earliest_buy_date, weeks_without_stock, lead_time_days, "
        "lead_time_overridden, target_coverage_weeks, on_order_qty, reliability, "
        "reliability_detail) values (:run, :product, :t, :abc, :td_low, :td_exp, :td_high, :stock, "
        ":cov_lower, :cov_exp, :cov_upper, :risk, :stockout, :sq_low, :sq_high, :truncated, "
        ":action, :buy_date, :earliest, :wws, :lead, :overridden, :target, :on_order, "
        ":reliability, cast(:detail as jsonb))"
    )

    def _metric_row(
        self,
        claim: JobClaim,
        run_id: UUID,
        product_ids: dict[str, UUID],
        p: ProductRun,
        result: RunResult,
    ) -> dict[str, Any]:
        a = p.analysis
        stockout_week = a.expected.stockout_week
        buy = a.buy_before
        earliest = None
        if buy.earliest_week is not None:
            earliest = (
                self._today()
                if buy.earliest_week == 0
                else inv.week_start(result.data_until, buy.earliest_week)
            )
        return {
            "run": run_id,
            "product": product_ids[p.code],
            "t": claim.tenant_id,
            "abc": p.abc_class,
            "td_low": a.typical_demand.low,
            "td_exp": a.typical_demand.expected,
            "td_high": a.typical_demand.high,
            "stock": p.current_stock,
            "cov_lower": a.coverage.lower,
            "cov_exp": a.coverage.expected,
            "cov_upper": a.coverage.upper,
            "risk": a.risk.value,
            "stockout": (
                inv.week_start(result.data_until, stockout_week) if stockout_week else None
            ),
            "sq_low": a.suggested.low,
            "sq_high": a.suggested.high,
            "truncated": a.suggested.truncated,
            "action": _BUY_BEFORE_ACTION[buy.action],
            "buy_date": inv.week_start(result.data_until, buy.week) if buy.week else None,
            "earliest": earliest,
            "wws": buy.weeks_without_stock,
            "lead": p.lead_time_days,
            "overridden": p.lead_time_overridden,
            "target": p.target_coverage_weeks,
            "on_order": p.on_order_qty,
            "reliability": p.reliability,
            "detail": json.dumps(p.reliability_detail),
        }

    @staticmethod
    def _log_event(
        conn: Connection, claim: JobClaim, run_id: UUID, products: int, forecast_rows: int
    ) -> None:
        conn.execute(
            text("select set_config('app.request_id', :rid, true)"), {"rid": str(claim.job_id)}
        )
        conn.execute(
            text("select audit.log_event(:t, 'run.created', 'run', :r, cast(:meta as jsonb))"),
            {
                "t": claim.tenant_id,
                "r": str(run_id),
                "meta": json.dumps({"products": products, "forecast_rows": forecast_rows}),
            },
        )
