"""Per-product lead time, target coverage and quantity on order. They outlive any run and apply the
next time results are calculated."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import NotFoundError
from api.schemas import ProductOverrides

_PRODUCT = text("select id from public.products where code = :code")
_UPSERT = text(
    "insert into public.product_overrides (tenant_id, product_id, lead_time_days, "
    "target_coverage_weeks, on_order_qty, updated_at) "
    "values (:tenant_id, :product_id, :lead_time_days, :target_coverage_weeks, "
    ":on_order_quantity, now()) "
    "on conflict (tenant_id, product_id) do update set lead_time_days = excluded.lead_time_days, "
    "target_coverage_weeks = excluded.target_coverage_weeks, on_order_qty = excluded.on_order_qty, "
    "updated_at = now()"
)
_DELETE = text("delete from public.product_overrides where product_id = :product_id")


async def put_overrides(
    session: AsyncSession, who: Principal, code: str, body: ProductOverrides
) -> ProductOverrides:
    """Replace the product's overrides; an override with every field cleared is deleted."""
    product_id = (await session.execute(_PRODUCT, {"code": code})).scalar_one_or_none()
    if product_id is None:
        raise NotFoundError
    values = body.model_dump()
    if all(value is None for value in values.values()):
        await session.execute(_DELETE, {"product_id": product_id})
    else:
        await session.execute(
            _UPSERT, {**values, "tenant_id": who.tenant_id, "product_id": product_id}
        )
    return body
