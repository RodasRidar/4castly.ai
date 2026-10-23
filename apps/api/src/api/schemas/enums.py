"""Enumerations of the contract. Values are stable API strings, never display text."""

from __future__ import annotations

from enum import StrEnum


class RiskLevel(StrEnum):
    CRITICAL = "critical"
    MEDIUM = "medium"
    OPTIMAL = "optimal"


class AbcClass(StrEnum):
    A = "A"
    B = "B"
    C = "C"


class Reliability(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ForecastMethod(StrEnum):
    MODEL = "model"
    SIMPLE = "simple"


class Scenario(StrEnum):
    LOW = "low"
    EXPECTED = "expected"
    HIGH = "high"


class BuyBeforeAction(StrEnum):
    ORDER_TODAY = "order_today"
    ORDER_BY_DATE = "order_by_date"
    NO_STOCKOUT = "no_stockout"


class WeekStatus(StrEnum):
    IN_STOCK = "in_stock"
    ARRIVAL = "arrival"
    STOCKOUT = "stockout"


class ConversationStage(StrEnum):
    """Driven by the backend, never inferred by the client (plan 2.1)."""

    QUEUED = "queued"
    UPLOADED = "uploaded"
    DIGESTING = "digesting"
    UNREADABLE = "unreadable"
    NEEDS_DATE_COLUMN = "needs_date_column"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    CONFIRMED = "confirmed"
    CLARIFYING = "clarifying"
    CALCULATING = "calculating"
    READY = "ready"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ConversationGroup(StrEnum):
    PINNED = "pinned"
    TODAY = "today"
    THIS_WEEK = "this_week"
    OLDER = "older"


class JobKind(StrEnum):
    DIGEST = "digest"
    FORECAST = "forecast"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobStage(StrEnum):
    READING_FILE = "reading_file"
    IDENTIFYING_COLUMNS = "identifying_columns"
    CLEANING_DATA = "cleaning_data"
    CALCULATING_FORECAST = "calculating_forecast"
    READY = "ready"


class StageState(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    DONE = "done"


class RunStatus(StrEnum):
    BUILDING = "building"
    READY = "ready"
    SUPERSEDED = "superseded"


class DefaultedParameter(StrEnum):
    """Parameters the user did not answer, so the run used a default (shown in results)."""

    LEAD_TIME = "lead_time"
    TARGET_COVERAGE = "target_coverage"
    STOCKOUT_CENSORING = "stockout_censoring"


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class Locale(StrEnum):
    ES = "es"
    EN = "en"


class AssistantStyle(StrEnum):
    BRIEF = "brief"
    DETAILED = "detailed"


class Granularity(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ExportFormat(StrEnum):
    XLSX = "xlsx"


class ExportScope(StrEnum):
    ALL = "all"
    SELECTION = "selection"
    PRODUCT = "product"


class ProductSort(StrEnum):
    NAME = "name"
    ABC_CLASS = "abc_class"
    TYPICAL_DEMAND = "typical_demand"
    CURRENT_STOCK = "current_stock"
    COVERAGE = "coverage"
    RISK = "risk"
    SUGGESTED_QUANTITY = "suggested_quantity"
    BUY_BEFORE = "buy_before"
    LEAD_TIME = "lead_time"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class SourceKind(StrEnum):
    KARDEX = "kardex"
    TABULAR = "tabular"


class MappedField(StrEnum):
    DATE = "date"
    PRODUCT_CODE = "product_code"
    PRODUCT_NAME = "product_name"
    QUANTITY = "quantity"
    STOCK = "stock"
    UNIT = "unit"


class MovementTreatment(StrEnum):
    """How a Kardex movement code is treated: sales minus customer returns are demand."""

    DEMAND = "demand"
    RETURN = "return"
    EXCLUDED = "excluded"


class PlanStatus(StrEnum):
    PROPOSED = "proposed"
    CONFIRMED = "confirmed"


class PlanAuthor(StrEnum):
    LLM = "llm"
    RULES = "rules"
    USER = "user"


class WarningSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"


class WarningCode(StrEnum):
    SHORT_HISTORY = "short_history"
    DROPPED_ROWS = "dropped_rows"
    MISSING_STOCK = "missing_stock"
    MIXED_UNITS = "mixed_units"
    STALE_DATA = "stale_data"


class ColumnType(StrEnum):
    DATE = "date"
    NUMBER = "number"
    TEXT = "text"
    EMPTY = "empty"


class UploadStatus(StrEnum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    READABLE = "readable"
    FAILED = "failed"


class UploadErrorCode(StrEnum):
    PASSWORD_PROTECTED = "password_protected"  # noqa: S105 - an error code, not a secret
    CORRUPT = "corrupt"
    UNSUPPORTED_FORMAT = "unsupported_format"
    EMPTY = "empty"
    TOO_LARGE = "too_large"


class HadStockouts(StrEnum):
    YES = "yes"
    NO = "no"
    UNKNOWN = "unknown"


class ClarificationQuestionId(StrEnum):
    LEAD_TIME = "lead_time_days"
    STOCKOUTS = "had_stockouts"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageKind(StrEnum):
    TEXT = "text"
    FILE = "file"
    MAPPING = "mapping"
    CLARIFICATION = "clarification"
    PROGRESS = "progress"
    RESULT = "result"
    ERROR = "error"


class MessageStatus(StrEnum):
    STREAMING = "streaming"
    COMPLETE = "complete"
    INTERRUPTED = "interrupted"
    ERROR = "error"


class FeedbackValue(StrEnum):
    UP = "up"
    DOWN = "down"


class StopReason(StrEnum):
    END_TURN = "end_turn"
    MAX_TOKENS = "max_tokens"
    REFUSAL = "refusal"
    CANCELLED = "cancelled"
