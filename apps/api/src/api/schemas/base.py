"""Base classes and error type shared by every contract schema."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    """Response models: attribute docstrings become OpenAPI descriptions."""

    model_config = ConfigDict(use_attribute_docstrings=True)


class RequestModel(ApiModel):
    """Request models reject unknown fields (S13)."""

    model_config = ConfigDict(extra="forbid", use_attribute_docstrings=True)


class FieldIssue(ApiModel):
    """One invalid input. Never echoes the submitted value."""

    field: str
    """Dotted path inside the request part, for example `risk_thresholds.medium_margin_weeks`."""
    code: str
    """Validation rule that failed, for example `string_too_short`."""


class ApiError(ApiModel):
    """RFC 9457 problem details. The UI shows `message_key` translated and `ref` as the support
    reference; it never shows `code` or `title`."""

    type: str = "about:blank"
    title: str
    status: int
    code: str
    """Stable machine code, for example `not_found`."""
    message_key: str
    """i18n key translated by the web app, for example `errors.notFound`."""
    ref: str = Field(min_length=1, max_length=32)
    """Short support reference, also logged with the trace id."""
    request_id: str | None = None
    fields: list[FieldIssue] = Field(default_factory=list)
    """Filled for validation errors so forms can mark the fields."""
