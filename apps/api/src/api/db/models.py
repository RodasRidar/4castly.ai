"""Typed models of the tables the SQL migrations create. They never create tables (plan 7b).

Foreign keys are composite `(tenant_id, id)` in the database; they are not repeated here because no
code navigates relationships through the ORM. A test fails when a table has no model.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import ARRAY, BigInteger, Boolean, Date, DateTime, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

_Timestamp = DateTime(timezone=True)


class Base(DeclarativeBase):
    type_annotation_map = {  # noqa: RUF012 - SQLAlchemy convention
        UUID: PG_UUID(as_uuid=True),
        datetime: _Timestamp,
        date: Date(),
        Decimal: Numeric(),
        dict: JSONB(),
        list: JSONB(),
    }


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    created_at: Mapped[datetime]


class TenantMember(Base):
    __tablename__ = "tenant_members"
    tenant_id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    role: Mapped[str]
    created_at: Mapped[datetime]


class AllowedEmail(Base):
    __tablename__ = "allowed_emails"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    email: Mapped[str] = mapped_column(Text)
    invited_at: Mapped[datetime]


class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    full_name: Mapped[str]
    job_title: Mapped[str | None]
    theme: Mapped[str]
    locale: Mapped[str]
    time_zone: Mapped[str]
    assistant_style: Mapped[str]


class Product(Base):
    __tablename__ = "products"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    code: Mapped[str]
    name: Mapped[str]
    uom: Mapped[str]
    created_at: Mapped[datetime]


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    created_by: Mapped[UUID | None]
    title: Mapped[str]
    pinned_at: Mapped[datetime | None]
    archived_at: Mapped[datetime | None]
    deleted_at: Mapped[datetime | None]
    stage: Mapped[str]
    current_run_id: Mapped[UUID | None]
    last_activity_at: Mapped[datetime]
    created_at: Mapped[datetime]


class Upload(Base):
    __tablename__ = "uploads"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    conversation_id: Mapped[UUID | None]
    created_by: Mapped[UUID | None]
    storage_path: Mapped[str]
    file_name: Mapped[str]
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    content_type: Mapped[str]
    sheets: Mapped[list[str]] = mapped_column(ARRAY(Text))
    selected_sheet: Mapped[str | None]
    profile: Mapped[dict | None]
    status: Mapped[str]
    error_code: Mapped[str | None]
    created_at: Mapped[datetime]


class NormalizationPlan(Base):
    __tablename__ = "normalization_plans"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    upload_id: Mapped[UUID]
    plan: Mapped[dict]
    proposed_by: Mapped[str]
    confirmed_at: Mapped[datetime | None]
    confirmed_by: Mapped[UUID | None]
    created_at: Mapped[datetime]


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    conversation_id: Mapped[UUID]
    kind: Mapped[str]
    status: Mapped[str]
    stage: Mapped[str | None]
    processed: Mapped[int | None] = mapped_column(Integer)
    total: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer)
    heartbeat_at: Mapped[datetime | None]
    cancel_requested: Mapped[bool] = mapped_column(Boolean)
    traceparent: Mapped[str | None]
    error_ref: Mapped[str | None]
    params: Mapped[dict]
    created_at: Mapped[datetime]
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]


class JobEvent(Base):
    __tablename__ = "job_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[UUID]
    job_id: Mapped[UUID]
    stage: Mapped[str]
    at: Mapped[datetime]


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    tenant_id: Mapped[UUID] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(primary_key=True)
    request_hash: Mapped[str]
    response: Mapped[dict | None]
    created_at: Mapped[datetime]
    expires_at: Mapped[datetime]


class RateLimit(Base):
    __tablename__ = "rate_limits"
    tenant_id: Mapped[UUID] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(primary_key=True)
    window_start: Mapped[datetime] = mapped_column(primary_key=True)
    count: Mapped[int] = mapped_column(Integer)


class Movement(Base):
    __tablename__ = "movements"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[UUID]
    product_id: Mapped[UUID]
    occurred_at: Mapped[datetime]
    movement_code: Mapped[str]
    movement_type: Mapped[str]
    document: Mapped[str]
    counterparty: Mapped[str]
    qty_in: Mapped[Decimal]
    qty_out: Mapped[Decimal]
    balance: Mapped[Decimal | None]
    source_file: Mapped[str | None]
    created_at: Mapped[datetime]


class DemandSeries(Base):
    __tablename__ = "demand_series"
    tenant_id: Mapped[UUID] = mapped_column(primary_key=True)
    product_id: Mapped[UUID] = mapped_column(primary_key=True)
    freq: Mapped[str] = mapped_column(primary_key=True)
    period: Mapped[date] = mapped_column(primary_key=True)
    demand: Mapped[Decimal]
    censored: Mapped[bool] = mapped_column(Boolean)
    upload_id: Mapped[UUID | None]


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[UUID]
    upload_id: Mapped[UUID]
    product_id: Mapped[UUID]
    sold_on: Mapped[date]
    qty: Mapped[Decimal]
    stock: Mapped[Decimal | None]


class ForecastRun(Base):
    __tablename__ = "forecast_runs"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    conversation_id: Mapped[UUID]
    job_id: Mapped[UUID | None]
    status: Mapped[str]
    data_until: Mapped[date]
    horizon_weeks: Mapped[int] = mapped_column(Integer)
    granularity: Mapped[str]
    params: Mapped[dict]
    pending_params: Mapped[dict | None]
    created_at: Mapped[datetime]


class Forecast(Base):
    __tablename__ = "forecasts"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[UUID]
    product_id: Mapped[UUID]
    job_id: Mapped[UUID | None]
    run_id: Mapped[UUID | None]
    horizon: Mapped[date]
    p10: Mapped[Decimal]
    p50: Mapped[Decimal]
    p90: Mapped[Decimal]
    model: Mapped[str]
    created_at: Mapped[datetime]


class RunProductMetric(Base):
    __tablename__ = "run_product_metrics"
    run_id: Mapped[UUID] = mapped_column(primary_key=True)
    product_id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID]
    abc_class: Mapped[str]
    typical_demand_low: Mapped[Decimal]
    typical_demand_expected: Mapped[Decimal]
    typical_demand_high: Mapped[Decimal]
    current_stock: Mapped[Decimal]
    coverage_weeks_lower: Mapped[Decimal | None]
    coverage_weeks_expected: Mapped[Decimal | None]
    coverage_weeks_upper: Mapped[Decimal | None]
    risk: Mapped[str]
    stockout_date: Mapped[date | None]
    suggested_qty_low: Mapped[Decimal]
    suggested_qty_high: Mapped[Decimal]
    suggested_truncated: Mapped[bool] = mapped_column(Boolean)
    buy_before_action: Mapped[str]
    buy_before_date: Mapped[date | None]
    earliest_buy_date: Mapped[date | None]
    weeks_without_stock: Mapped[Decimal]
    lead_time_days: Mapped[int] = mapped_column(Integer)
    lead_time_overridden: Mapped[bool] = mapped_column(Boolean)
    target_coverage_weeks: Mapped[int] = mapped_column(Integer)
    on_order_qty: Mapped[Decimal]
    reliability: Mapped[str]
    reliability_detail: Mapped[dict]


class ProductOverride(Base):
    __tablename__ = "product_overrides"
    tenant_id: Mapped[UUID] = mapped_column(primary_key=True)
    product_id: Mapped[UUID] = mapped_column(primary_key=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    target_coverage_weeks: Mapped[int | None] = mapped_column(Integer)
    on_order_qty: Mapped[Decimal | None]
    updated_at: Mapped[datetime]


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    seq: Mapped[int] = mapped_column(BigInteger)
    tenant_id: Mapped[UUID]
    conversation_id: Mapped[UUID]
    created_by: Mapped[UUID | None]
    role: Mapped[str]
    kind: Mapped[str]
    blocks: Mapped[list]
    display_text: Mapped[str]
    payload: Mapped[dict]
    annotations: Mapped[list]
    status: Mapped[str]
    context_product_id: Mapped[UUID | None]
    created_at: Mapped[datetime]


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    tenant_id: Mapped[UUID]
    message_id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(primary_key=True)
    value: Mapped[str]
    created_at: Mapped[datetime]
