"""The portfolio table: filter, search, sort and paginate the stored per-product metrics.

Sort fields and directions come from allowlists, so no request text is ever interpolated into SQL.
"""

from __future__ import annotations

import unicodedata
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal
from api.domain.errors import BusinessRuleError
from api.schemas import ProductPage
from api.schemas.enums import AbcClass, ProductSort, RiskLevel, SortOrder
from api.services.product_rows import METRIC_COLUMNS, product_row
from api.services.run_data import load_run

_ACCENTED = "áàâäãéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ"
_PLAIN = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC"
# translate() first: lower() alone ignores accented capitals under the C locale.
_FOLD = f"lower(translate({{expr}}, '{_ACCENTED}', '{_PLAIN}'))"
_LIKE_ESCAPES = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})

# Expression to order by. Missing coverage / no stockout means "never": it sorts as the largest.
_SORT_EXPRESSIONS = {
    ProductSort.NAME: _FOLD.format(expr="p.name"),
    ProductSort.ABC_CLASS: "m.abc_class",
    ProductSort.TYPICAL_DEMAND: "m.typical_demand_expected",
    ProductSort.CURRENT_STOCK: "m.current_stock",
    ProductSort.COVERAGE: "coalesce(m.coverage_weeks_expected, 1e9)",
    ProductSort.RISK: "case m.risk when 'critical' then 0 when 'medium' then 1 else 2 end",
    ProductSort.SUGGESTED_QUANTITY: "m.suggested_qty_low",
    ProductSort.BUY_BEFORE: (
        "case m.buy_before_action when 'order_today' then 0 when 'order_by_date' then 1 else 2 end"
    ),
    ProductSort.LEAD_TIME: "m.lead_time_days",
}
# Second key for sorts where the first one has ties that still mean something.
_SORT_TIEBREAK = {
    ProductSort.BUY_BEFORE: "coalesce(m.buy_before_date, date '9999-12-31')",
    ProductSort.RISK: "coalesce(m.coverage_weeks_expected, 1e9)",
}
_NEEDS_STOCK = frozenset(
    {
        ProductSort.RISK,
        ProductSort.COVERAGE,
        ProductSort.CURRENT_STOCK,
        ProductSort.SUGGESTED_QUANTITY,
        ProductSort.BUY_BEFORE,
    }
)
_DIRECTION = {SortOrder.ASC: "asc", SortOrder.DESC: "desc"}


def fold(value: str) -> str:
    """The Python side of the accent-insensitive search (the SQL side is `translate`)."""
    plain = unicodedata.normalize("NFKD", value.lower())
    return "".join(c for c in plain if not unicodedata.combining(c))


async def list_products(  # noqa: PLR0913, PLR0917
    session: AsyncSession,
    who: Principal,
    run_id: UUID,
    q: str | None,
    risk: list[RiskLevel] | None,
    abc: list[AbcClass] | None,
    sort: ProductSort,
    order: SortOrder,
    page: int,
    page_size: int,
) -> ProductPage:
    del who
    info = await load_run(session, run_id)
    stock_known = info.stock_known
    if risk and not stock_known:
        raise BusinessRuleError("errors.stockUnknown")  # there is no risk to filter by
    if not stock_known and sort in _NEEDS_STOCK:
        sort = ProductSort.NAME  # these columns are null: order by name, in the same direction
    where = ["m.run_id = :run"]
    params: dict[str, Any] = {"run": run_id}
    if q:
        needle = f"%{fold(q).translate(_LIKE_ESCAPES)}%"
        where.append(
            f"({_FOLD.format(expr='p.code')} like :needle escape '\\' "
            f"or {_FOLD.format(expr='p.name')} like :needle escape '\\')"
        )
        params["needle"] = needle
    if risk:
        where.append("m.risk = any(:risks)")
        params["risks"] = [r.value for r in risk]
    if abc:
        where.append("m.abc_class = any(:abcs)")
        params["abcs"] = [a.value for a in abc]
    direction = _DIRECTION[order]
    keys = [f"{_SORT_EXPRESSIONS[sort]} {direction}"]
    if sort in _SORT_TIEBREAK:
        keys.append(f"{_SORT_TIEBREAK[sort]} {direction}")
    keys.append("p.code asc")
    source = (
        "from public.run_product_metrics m "
        "join public.products p on p.tenant_id = m.tenant_id and p.id = m.product_id "
    )
    rows = (
        await session.execute(
            text(
                f"select {METRIC_COLUMNS} {source} where {' and '.join(where)} "
                f"order by {', '.join(keys)} limit :limit offset :offset"
            ),
            {**params, "limit": page_size, "offset": (page - 1) * page_size},
        )
    ).all()
    total = (
        await session.execute(
            text(f"select count(*) {source} where {' and '.join(where)}"),
            params,
        )
    ).scalar_one()
    unfiltered = (
        await session.execute(
            text("select count(*) from public.run_product_metrics where run_id = :run"),
            {"run": run_id},
        )
    ).scalar_one()
    return ProductPage(
        items=[product_row(r, stock_known=stock_known) for r in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_unfiltered=unfiltered,
    )
