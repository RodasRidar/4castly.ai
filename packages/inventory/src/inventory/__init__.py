"""Inventory formulas (pure Python, no runtime dependencies)."""

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
    "BuyBefore",
    "CoverageRange",
    "Demand",
    "InvalidInputError",
    "ProductAnalysis",
    "ProductInputs",
    "QuantityRange",
    "RiskLevel",
    "RiskThresholds",
    "Scenario",
    "ScenarioProjection",
    "SuggestedQuantity",
    "analyze_product",
    "buy_before",
    "classify_risk",
    "is_stale",
    "lead_time_weeks",
    "project_scenario",
    "suggest_quantity",
    "typical_weekly_demand",
    "week_start",
    "with_purchase",
]
