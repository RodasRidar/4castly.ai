"""Forecast runs, the portfolio table, product detail, what-if simulation, overrides, exports."""

from __future__ import annotations

from datetime import date
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, Field, model_validator

from api.schemas.base import ApiModel, RequestModel
from api.schemas.common import CoverageRange, DateSpan, FilterLink, QuantityRange, ScenarioValues
from api.schemas.enums import (
    AbcClass,
    AssistantStyle,
    BuyBeforeAction,
    DefaultedParameter,
    ExportFormat,
    ExportScope,
    ForecastMethod,
    Granularity,
    HadStockouts,
    Reliability,
    RiskLevel,
    RunStatus,
    WeekStatus,
)

HORIZON_OPTIONS = (8, 12, 24)


class ClarificationAnswers(RequestModel):
    """Answers to the clarification card (05). Each is optional; at least one must be given."""

    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    had_stockouts: HadStockouts | None = None
    """Asked only when the file has no stock column."""

    @model_validator(mode="after")
    def _not_empty(self) -> Self:
        if self.lead_time_days is None and self.had_stockouts is None:
            raise ValueError("answer at least one question")
        return self


class ForecastRequest(RequestModel):
    """Either the answers or `skip: true` ("Omitir y pronosticar ahora")."""

    answers: ClarificationAnswers | None = None
    skip: bool = False

    @model_validator(mode="after")
    def _answers_xor_skip(self) -> Self:
        if self.skip == (self.answers is not None):
            raise ValueError("send either answers or skip: true")
        return self


class RiskThresholds(RequestModel):
    """Risk bands in weeks above the lead time: critical below `lead + critical_margin`, medium
    below `lead + medium_margin`."""

    critical_margin_weeks: float = Field(default=0.0, ge=0, le=52)
    medium_margin_weeks: float = Field(default=2.0, ge=0, le=52)

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.critical_margin_weeks > self.medium_margin_weeks:
            raise ValueError("critical margin cannot exceed the medium margin")
        return self


class RunParameters(RequestModel):
    """Parameters drawer. Also used as the response."""

    horizon_weeks: int
    granularity: Granularity
    lead_time_days: int = Field(ge=1, le=365)
    """Default lead time; products can override it."""
    target_coverage_weeks: int = Field(ge=0, le=52)
    risk_thresholds: RiskThresholds
    assistant_style: AssistantStyle

    @model_validator(mode="after")
    def _offered_horizon(self) -> Self:
        if self.horizon_weeks not in HORIZON_OPTIONS:
            raise ValueError(f"horizon must be one of {HORIZON_OPTIONS}")
        return self


class ForecastRun(ApiModel):
    id: UUID
    conversation_id: UUID
    status: RunStatus
    data_until: date
    parameters: RunParameters
    defaults_used: list[DefaultedParameter]
    """Parameters the user skipped, so the results must say a default was used."""
    stale: bool
    """`data_until` is more than 7 days old."""
    parameters_pending: bool
    """`parameters` were saved from the drawer but the results still use the previous values
    until "Recalcular"."""
    created_at: AwareDatetime


class SeriesPoint(ApiModel):
    """One chart point. Only the fields that apply to the date are set."""

    date: date
    actual: float | None = None
    censored: bool = False
    """The week was affected by a stockout, so `actual` is a lower bound."""
    expected: float | None = None
    low: float | None = None
    high: float | None = None
    projected_stock: float | None = None


class UomSeries(ApiModel):
    """Aggregate series for one unit of measure (units cannot be added together)."""

    uom: str
    points: list[SeriesPoint]


class RiskDistribution(ApiModel):
    critical: int = Field(ge=0)
    medium: int = Field(ge=0)
    optimal: int = Field(ge=0)


class ReliabilityDistribution(ApiModel):
    high: int = Field(ge=0)
    medium: int = Field(ge=0)
    low: int = Field(ge=0)


class ReliabilityKpi(ApiModel):
    overall: Reliability
    distribution: ReliabilityDistribution


class RunKpis(ApiModel):
    products_at_risk: FilterLink
    """Products with critical risk, with the filter that lists them."""
    average_coverage_weeks: CoverageRange
    """Mean over products; a product without stockout counts as the horizon (lower bound)."""
    reliability: ReliabilityKpi


class RunSummary(ApiModel):
    run: ForecastRun
    kpis: RunKpis
    risk_distribution: RiskDistribution
    total_products: int = Field(ge=0)
    stock_known: bool
    """The file had a stock column. Without it stock is assumed 0 and results are indicative."""
    series_by_uom: list[UomSeries]
    today: date


class BuyBefore(ApiModel):
    action: BuyBeforeAction
    date: date | None
    """Place the order before this date (`order_by_date`)."""
    earliest_date: date | None
    """Earlier bound from high demand; `null` when high demand does not stock out either."""
    weeks_without_stock: float = Field(ge=0)
    """How long the product stays empty if the order is placed today."""


class ProductRow(ApiModel):
    code: str
    name: str
    uom: str
    abc_class: AbcClass
    typical_demand: ScenarioValues
    """Mean weekly demand over the next 4 weeks."""
    current_stock: float
    coverage_weeks: CoverageRange
    risk: RiskLevel
    reliability: Reliability
    stockout_date: date | None
    suggested_quantity: QuantityRange
    suggested_truncated: bool
    """The horizon is shorter than lead time + target coverage, so the figure is partial."""
    buy_before: BuyBefore
    lead_time_days: int
    lead_time_overridden: bool
    target_coverage_weeks: int
    on_order_quantity: float


class ProductPage(ApiModel):
    items: list[ProductRow]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    """Products matching the filters ("12" of "12 de 142 en foco")."""
    total_unfiltered: int = Field(ge=0)


class PurchaseRecommendation(ApiModel):
    lead_time_days: int
    target_coverage_weeks: int
    suggested_quantity: QuantityRange
    truncated: bool
    buy_before: BuyBefore


class ReliabilityDetail(ApiModel):
    """Plain-language reliability plus the technical detail behind "Ver detalle técnico"."""

    level: Reliability
    method: ForecastMethod
    history_weeks: int = Field(ge=0)
    non_censored_weeks: int = Field(ge=0)
    backtest_error_pct: float | None
    """Weekly WAPE from the rolling backtest; `null` without enough history."""


class WeeklyProjectionRow(ApiModel):
    week: int = Field(ge=1)
    week_start: date
    demand: ScenarioValues
    projected_stock: ScenarioValues
    shortfall: ScenarioValues
    arrival_quantity: float = Field(ge=0)
    status: WeekStatus
    """Status under the expected scenario."""


class Arrival(ApiModel):
    date: date
    quantity: float = Field(ge=0)


class ProductProjection(ApiModel):
    weekly: list[WeeklyProjectionRow]
    series: list[SeriesPoint]
    """History, forecast range and projected stock for the chart."""
    stockout_zones: list[DateSpan]
    arrivals: list[Arrival]


class ProductDetail(ApiModel):
    product: ProductRow
    data_until: date
    today: date
    purchase: PurchaseRecommendation
    reliability: ReliabilityDetail
    without_new_purchase: ProductProjection
    with_suggested_purchase: ProductProjection
    """The suggested quantity (low bound) arriving at the lead time ("Con compra sugerida")."""


class SimulationRequest(RequestModel):
    """What-if over the persisted forecast. Omitted fields keep the product's current values."""

    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    target_coverage_weeks: int | None = Field(default=None, ge=0, le=52)
    with_purchase: bool = False
    purchase_quantity: float | None = Field(default=None, ge=0)
    """Quantity arriving at the lead time; defaults to the suggested low bound."""


class SimulationResult(ApiModel):
    product: ProductRow
    purchase: PurchaseRecommendation
    projection: ProductProjection


class ProductOverrides(RequestModel):
    """Per-product values. `null` clears the override and falls back to the run defaults."""

    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    target_coverage_weeks: int | None = Field(default=None, ge=0, le=52)
    on_order_quantity: float | None = Field(default=None, ge=0)


class ExportRequest(RequestModel):
    format: ExportFormat = ExportFormat.XLSX
    scope: ExportScope
    codes: list[str] | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _codes_match_scope(self) -> Self:
        count = len(self.codes) if self.codes is not None else 0
        if self.scope is ExportScope.ALL and self.codes is not None:
            raise ValueError("scope all takes no product codes")
        if self.scope is ExportScope.SELECTION and count < 1:
            raise ValueError("scope selection needs product codes")
        if self.scope is ExportScope.PRODUCT and count != 1:
            raise ValueError("scope product needs exactly one product code")
        return self


class ExportFile(ApiModel):
    file_name: str
    download_url: str
    """Signed URL valid for 60 seconds (S6)."""
    expires_at: AwareDatetime
    format: Literal[ExportFormat.XLSX] = ExportFormat.XLSX
