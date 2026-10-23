"""What a forecast job computes and publishes. Pure data; the formulas come from `inventory`."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

import inventory as inv


@dataclass(frozen=True)
class DemandPoint:
    period: date
    demand: float
    censored: bool


@dataclass(frozen=True)
class ProductDemand:
    """A product with its cleaned weekly demand (the `demand_series` rows)."""

    code: str
    name: str
    uom: str
    points: tuple[DemandPoint, ...]
    current_stock: float | None
    """Unknown (no stock column and no balance) is None, never zero."""


@dataclass(frozen=True)
class ProductOverride:
    lead_time_days: int | None = None
    target_coverage_weeks: int | None = None
    on_order_qty: float | None = None


@dataclass(frozen=True)
class ProductRun:
    """One product's published figures: scenarios, analysis and how much to trust them."""

    code: str
    abc_class: str
    method: str  # model | simple
    forecaster: str
    forecast_dates: tuple[date, ...]
    demand: inv.Demand
    analysis: inv.ProductAnalysis
    current_stock: float
    lead_time_days: int
    lead_time_overridden: bool
    target_coverage_weeks: int
    on_order_qty: float
    data_until: date
    reliability: str  # high | medium | low
    reliability_detail: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RunResult:
    data_until: date
    horizon_weeks: int
    granularity: str
    params: dict[str, Any]
    products: tuple[ProductRun, ...]


@dataclass(frozen=True)
class UploadInfo:
    upload_id: Any
    storage_path: str
    file_name: str
