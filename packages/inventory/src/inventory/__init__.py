"""Inventory formulas (pure Python, no runtime dependencies)."""

from inventory.abc import AbcClass, AbcItem, classify_abc
from inventory.analysis import (
    analyze_product,
    buy_before,
    classify_risk,
    suggest_quantity,
    typical_weekly_demand,
    with_purchase,
)
from inventory.calendar import is_stale, week_start
from inventory.errors import InvalidInputError
from inventory.history import (
    HorizonOption,
    Method,
    available_horizons,
    select_method,
    simple_demand,
)
from inventory.models import (
    BuyBefore,
    CoverageRange,
    Demand,
    ProductAnalysis,
    ProductInputs,
    QuantityRange,
    RiskLevel,
    RiskThresholds,
    Scenario,
    ScenarioProjection,
    SuggestedQuantity,
)
from inventory.projection import lead_time_weeks, project_scenario

__all__ = [
    "AbcClass",
    "AbcItem",
    "BuyBefore",
    "CoverageRange",
    "Demand",
    "HorizonOption",
    "InvalidInputError",
    "Method",
    "ProductAnalysis",
    "ProductInputs",
    "QuantityRange",
    "RiskLevel",
    "RiskThresholds",
    "Scenario",
    "ScenarioProjection",
    "SuggestedQuantity",
    "analyze_product",
    "available_horizons",
    "buy_before",
    "classify_abc",
    "classify_risk",
    "is_stale",
    "lead_time_weeks",
    "project_scenario",
    "select_method",
    "simple_demand",
    "suggest_quantity",
    "typical_weekly_demand",
    "week_start",
    "with_purchase",
]
