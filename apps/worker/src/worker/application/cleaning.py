"""Cleaning: movements -> validated frame -> zero-filled demand series with stockout flags."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

import pandera.polars as pa
import polars as pl

from worker.domain.models import DemandSeries, Frequency, Movement

SALE_CODE = "01"
CUSTOMER_RETURN_CODE = "05"
# Not demand: 02 import receipt, 11 warehouse transfer, 99 inventory adjustment.
NON_DEMAND_CODES = frozenset({"02", "11", "99"})

DEFAULT_STOCKOUT_THRESHOLD = 0.5
# Stock below this share of a typical period's demand cannot serve typical orders.
DEFAULT_LOW_STOCK_RATIO = 0.25


class MovementsSchema(pa.DataFrameModel):
    sku: str = pa.Field(nullable=False)
    sku_name: str
    uom: str
    timestamp: pl.Datetime
    movement_code: str
    movement_type: str
    document: str
    counterparty: str
    qty_in: float = pa.Field(ge=0)
    qty_out: float = pa.Field(ge=0)
    balance: float = pa.Field(nullable=True)

    class Config:  # ty: ignore[invalid-attribute-override]  (pandera's documented API)
        strict = True
        coerce = True


def movements_to_frame(movements: Iterable[Movement]) -> pl.DataFrame:
    """Build the movements frame and validate it against `MovementsSchema`."""
    rows = [
        {
            "sku": m.sku,
            "sku_name": m.sku_name,
            "uom": m.uom,
            "timestamp": m.timestamp,
            "movement_code": m.movement_code,
            "movement_type": m.movement_type,
            "document": m.document,
            "counterparty": m.counterparty,
            "qty_in": m.qty_in,
            "qty_out": m.qty_out,
            "balance": m.balance,
        }
        for m in movements
    ]
    frame = pl.DataFrame(rows, schema_overrides={"timestamp": pl.Datetime, "balance": pl.Float64})
    return MovementsSchema.validate(frame)


def _with_running_balance(frame: pl.DataFrame) -> pl.DataFrame:
    """Sort per SKU and make sure every row has a balance (forward-filled, else cumulative)."""
    ordered = frame.sort(["sku", "timestamp"], maintain_order=True)
    return ordered.with_columns(
        pl.when(pl.col("balance").is_null().all().over("sku"))
        .then((pl.col("qty_in") - pl.col("qty_out")).cum_sum().over("sku"))
        .otherwise(pl.col("balance").forward_fill().over("sku"))
        .alias("balance")
    )


def build_demand_frame(
    movements: pl.DataFrame,
    freq: Frequency = "daily",
    stockout_threshold: float = DEFAULT_STOCKOUT_THRESHOLD,
    low_stock_ratio: float = DEFAULT_LOW_STOCK_RATIO,
) -> pl.DataFrame:
    """Return one row per (sku, period) with demand `y`, `balance` and `censored`.

    demand = sales ('01', qty_out) - customer returns ('05', qty_in). Transfers ('11'),
    imports ('02'), adjustments ('99') and the opening balance never count as demand.
    A period is censored when the running balance inside it (or carried into it, for
    periods without movements) dropped to <= max(`stockout_threshold`,
    `low_stock_ratio` * typical demand), where typical demand is the SKU's median
    positive period demand.
    """
    interval: Literal["1d", "1w"] = "1d" if freq == "daily" else "1w"
    prepared = _with_running_balance(movements).with_columns(
        pl.col("timestamp").dt.truncate(interval).alias("period"),
        pl.when(pl.col("movement_code") == SALE_CODE)
        .then(pl.col("qty_out"))
        .when(pl.col("movement_code") == CUSTOMER_RETURN_CODE)
        .then(-pl.col("qty_in"))
        .otherwise(0.0)
        .alias("demand"),
    )

    per_period = prepared.group_by(["sku", "period"]).agg(
        pl.col("demand").sum().alias("y"),
        pl.col("balance").min().alias("bal_min"),
        pl.col("balance").last().alias("bal_last"),
    )

    bounds = prepared.group_by("sku").agg(
        pl.col("period").min().alias("start"), pl.col("period").max().alias("end")
    )
    grid = (
        bounds.with_columns(pl.datetime_ranges("start", "end", interval=interval).alias("period"))
        .explode("period")
        .select("sku", "period")
    )

    full = (
        grid.join(per_period, on=["sku", "period"], how="left")
        .sort(["sku", "period"])
        .with_columns(
            pl.col("y").fill_null(0.0),
            pl.col("bal_last").forward_fill().over("sku"),
        )
        .with_columns(
            pl.col("bal_min").fill_null(pl.col("bal_last")),
            pl.col("y").clip(lower_bound=0.0),
        )
    )
    typical_demand = pl.col("y").filter(pl.col("y") > 0).median().over("sku").fill_null(0.0)
    low_stock = pl.max_horizontal(pl.lit(stockout_threshold), low_stock_ratio * typical_demand)
    return full.select(
        "sku",
        pl.col("period").dt.date().alias("ds"),
        "y",
        pl.col("bal_min").alias("balance"),
        (pl.col("bal_min") <= low_stock).alias("censored"),
    )


def to_demand_series(frame: pl.DataFrame, freq: Frequency = "daily") -> list[DemandSeries]:
    series: list[DemandSeries] = []
    for sku, group in frame.group_by("sku", maintain_order=True):
        series.append(
            DemandSeries(
                sku=str(sku[0]),
                freq=freq,
                ds=group["ds"].to_list(),
                y=group["y"].to_list(),
                censored=group["censored"].fill_null(False).to_list(),
            )
        )
    return series
