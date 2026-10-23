"""Weekly demand per product, built from a plan's rows or from Kardex movements.

Only complete weeks count: the week in which the data ends is dropped, because a half week of sales
looks like a collapse in demand. `data_until` is the Sunday that closes the last complete week, so
the first forecast week is the Monday after it, exactly what the formulas assume.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import median

import polars as pl

from worker.application.cleaning import (
    DEFAULT_LOW_STOCK_RATIO,
    DEFAULT_STOCKOUT_THRESHOLD,
    build_demand_frame,
    movements_to_frame,
    with_running_balance,
)
from worker.domain.errors import PermanentJobError
from worker.domain.models import Movement
from worker.domain.results import DemandPoint, ProductDemand

_SUNDAY = 6


class NotEnoughDataError(PermanentJobError):
    """The file has no complete week of demand to work with."""


@dataclass(frozen=True)
class WeeklyDemand:
    products: tuple[ProductDemand, ...]
    data_until: date
    """The Sunday that closes the last complete week."""


def last_complete_sunday(last_day: date) -> date:
    """The latest Sunday that is not after `last_day`... or, if `last_day` is mid-week, the Sunday
    before it: that week has not ended in the data."""
    if last_day.weekday() == _SUNDAY:
        return last_day
    return last_day - timedelta(days=last_day.weekday() + 1)


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _weeks(first: date, last: date) -> list[date]:
    return [first + timedelta(weeks=i) for i in range(((last - first).days // 7) + 1)]


def _censored(demand: Sequence[float], low_stock: Sequence[float | None]) -> list[bool]:
    """A week is censored when the stock fell to what typical orders need or less."""
    positive = [d for d in demand if d > 0]
    typical = median(positive) if positive else 0.0
    limit = max(DEFAULT_STOCKOUT_THRESHOLD, DEFAULT_LOW_STOCK_RATIO * typical)
    return [stock is not None and stock <= limit for stock in low_stock]


def demand_from_sales(frame: pl.DataFrame) -> WeeklyDemand:
    """`frame`: sku, sku_name, uom, ds, qty, stock (the executor's output)."""
    if frame.is_empty():
        message = "the file has no usable rows"
        raise NotEnoughDataError(message)
    last_sunday = last_complete_sunday(frame["ds"].max())  # ty: ignore[invalid-argument-type]
    last_monday = last_sunday - timedelta(days=6)
    weekday = pl.col("ds").dt.weekday() - 1
    with_week = frame.with_columns((pl.col("ds") - pl.duration(days=weekday)).alias("week"))
    complete = with_week.filter(pl.col("week") <= last_monday)
    if complete.is_empty():
        message = "the data does not cover one complete week"
        raise NotEnoughDataError(message)

    weekly = complete.group_by(["sku", "week"]).agg(
        pl.col("qty").sum().alias("demand"), pl.col("stock").min().alias("stock_min")
    )
    by_sku = {
        key[0]: rows
        for key, rows in weekly.partition_by("sku", as_dict=True, maintain_order=True).items()
    }
    ident = frame.group_by("sku", maintain_order=True).agg(
        pl.col("sku_name").first(), pl.col("uom").first()
    )
    latest_stock = {
        r["sku"]: r["stock"]
        for r in frame.filter(pl.col("stock").is_not_null())
        .sort("ds")
        .group_by("sku", maintain_order=True)
        .agg(pl.col("stock").last())
        .iter_rows(named=True)
    }

    products: list[ProductDemand] = []
    for row in ident.iter_rows(named=True):
        rows = by_sku.get(row["sku"])
        if rows is None:  # every sale of this product is in the partial week
            continue
        sums = dict(zip(rows["week"].to_list(), rows["demand"].to_list(), strict=True))
        stocks = dict(zip(rows["week"].to_list(), rows["stock_min"].to_list(), strict=True))
        weeks = _weeks(min(sums), last_monday)
        demand = [max(0.0, sums.get(w, 0.0)) for w in weeks]
        carried: list[float | None] = []
        last_known: float | None = None
        for w in weeks:
            last_known = stocks.get(w) if stocks.get(w) is not None else last_known
            carried.append(last_known)
        flags = _censored(demand, carried)
        points = tuple(DemandPoint(w, d, c) for w, d, c in zip(weeks, demand, flags, strict=True))
        products.append(
            ProductDemand(
                row["sku"], row["sku_name"], row["uom"], points, latest_stock.get(row["sku"])
            )
        )
    return WeeklyDemand(tuple(products), last_sunday)


def demand_from_movements(movements: Sequence[Movement]) -> WeeklyDemand:
    """Kardex movements: demand is sales minus customer returns (cleaning rules)."""
    if not movements:
        message = "the Kardex has no movements"
        raise NotEnoughDataError(message)
    last_sunday = last_complete_sunday(max(m.timestamp for m in movements).date())
    last_monday = last_sunday - timedelta(days=6)
    complete = [m for m in movements if m.timestamp.date() <= last_sunday]
    if not complete:
        message = "the data does not cover one complete week"
        raise NotEnoughDataError(message)

    demand_frame = build_demand_frame(movements_to_frame(complete), freq="weekly")
    identity = {m.sku: (m.sku_name, m.uom) for m in reversed(complete)}
    latest = (
        with_running_balance(movements_to_frame(movements))
        .sort(["sku", "timestamp"], maintain_order=True)
        .group_by("sku", maintain_order=True)
        .agg(pl.col("balance").last())
    )
    latest_stock = {r["sku"]: r["balance"] for r in latest.iter_rows(named=True)}

    products: list[ProductDemand] = []
    for key, group in demand_frame.partition_by("sku", as_dict=True, maintain_order=True).items():
        code = str(key[0])
        sums = dict(zip(group["ds"].to_list(), group["y"].to_list(), strict=True))
        flags = dict(zip(group["ds"].to_list(), group["censored"].to_list(), strict=True))
        balance = group["balance"].to_list()
        weeks = _weeks(min(sums), last_monday)
        demand = [sums.get(w, 0.0) for w in weeks]
        # Weeks after the product's last movement keep the balance it ended with.
        tail = [
            balance[-1] if w not in sums else None for w in weeks
        ]  # None where the frame already decided
        padded = _censored(demand, tail)
        points = tuple(
            DemandPoint(w, d, bool(flags[w]) if w in flags else padded[i])
            for i, (w, d) in enumerate(zip(weeks, demand, strict=True))
        )
        name, uom = identity[code]
        products.append(ProductDemand(code, name, uom, points, latest_stock.get(code)))
    if not products:
        message = "no product has a complete week of history"
        raise NotEnoughDataError(message)
    return WeeklyDemand(tuple(products), last_sunday)
