"""Excel export of a run (all products, a selection or one). Cells that come from user data are
forced to text (S14); the file goes to the private bucket and the caller gets a 60-second link."""

from __future__ import annotations

import io
from typing import Any
from uuid import UUID, uuid4

from openpyxl import Workbook
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import Principal, Tx
from api.domain.errors import NotFoundError
from api.schemas import ExportFile, ExportRequest
from api.schemas.enums import ExportScope
from api.services import audit, limits
from api.services.exports import append_row
from api.services.product_rows import METRIC_COLUMNS, product_row
from api.services.run_data import RunInfo, load_run
from api.services.uploads import safe_file_name

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOWNLOAD_TTL_SECONDS = 60

_LOCALE = text("select locale from public.profiles where user_id = :user_id")
_ROWS = (
    f"select {METRIC_COLUMNS} from public.run_product_metrics m "  # noqa: S608 - constant columns
    "join public.products p on p.tenant_id = m.tenant_id and p.id = m.product_id "
    "where m.run_id = :run {filter} "
    "order by case m.risk when 'critical' then 0 when 'medium' then 1 else 2 end, "
    "coalesce(m.coverage_weeks_expected, 1e9), p.code"
)

_TEXT: dict[str, dict[str, Any]] = {
    "es": {
        "headers": (
            "Código",
            "Producto",
            "Unidad",
            "Clase ABC",
            "Demanda típica semanal",
            "Stock actual",
            "Cobertura (semanas)",
            "Riesgo",
            "Fiabilidad",
            "Fecha de quiebre",
            "Cantidad sugerida mín.",
            "Cantidad sugerida máx.",
            "Comprar antes de",
            "Plazo de reposición (días)",
            "Cobertura objetivo (semanas)",
            "En camino",
        ),
        "risk": {"critical": "Crítico", "medium": "Medio", "optimal": "Óptimo"},
        "reliability": {"high": "Alta", "medium": "Media", "low": "Baja"},
        "no_stockout": "Sin quiebre en el horizonte",
        "order_today": "Pedir hoy",
        "not_needed": "No hace falta",
    },
    "en": {
        "headers": (
            "Code",
            "Product",
            "Unit",
            "ABC class",
            "Typical weekly demand",
            "Current stock",
            "Coverage (weeks)",
            "Risk",
            "Reliability",
            "Stockout date",
            "Suggested qty min.",
            "Suggested qty max.",
            "Order before",
            "Lead time (days)",
            "Target coverage (weeks)",
            "On order",
        ),
        "risk": {"critical": "Critical", "medium": "Medium", "optimal": "Optimal"},
        "reliability": {"high": "High", "medium": "Medium", "low": "Low"},
        "no_stockout": "No stockout within the horizon",
        "order_today": "Order today",
        "not_needed": "Not needed",
    },
}


_NO_STOCK_COLUMNS = (0, 1, 2, 3, 4, 8)
"""Code, product, unit, ABC class, typical demand and reliability: what exists without stock."""


def _cells(row: Any, words: dict[str, Any], *, stock_known: bool) -> list[Any]:
    if not stock_known:
        full = [row.code, row.name, row.uom, row.abc_class.value, row.typical_demand.expected]
        return [*full, words["reliability"][row.reliability.value]]
    buy = row.buy_before
    order = {
        "order_today": words["order_today"],
        "order_by_date": buy.date,
        "no_stockout": words["not_needed"],
    }[buy.action.value]
    coverage = row.coverage_weeks.expected
    return [
        row.code,
        row.name,
        row.uom,
        row.abc_class.value,
        row.typical_demand.expected,
        row.current_stock,
        words["no_stockout"] if coverage is None else coverage,
        words["risk"][row.risk.value],
        words["reliability"][row.reliability.value],
        row.stockout_date,
        row.suggested_quantity.low,
        row.suggested_quantity.high,
        order,
        row.lead_time_days,
        row.target_coverage_weeks,
        row.on_order_quantity,
    ]


def workbook(rows: list[Any], locale: str, *, stock_known: bool = True) -> bytes:
    words = _TEXT.get(locale, _TEXT["es"])
    book = Workbook()
    sheet = book.active
    sheet.title = "Forecast"
    headers = words["headers"]
    append_row(sheet, headers if stock_known else [headers[i] for i in _NO_STOCK_COLUMNS])
    for row in rows:
        append_row(sheet, _cells(row, words, stock_known=stock_known))
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def _file_name(info: RunInfo, body: ExportRequest) -> str:
    if body.scope is ExportScope.PRODUCT and body.codes:
        stem = safe_file_name(body.codes[0]).rsplit(".", 1)[0]
        return f"forecast-{stem}-{info.data_until}.xlsx"
    return f"forecast-{info.data_until}.xlsx"


async def _collect(
    session: AsyncSession, who: Principal, run_id: UUID, body: ExportRequest
) -> tuple[RunInfo, list[Any], str]:
    info = await load_run(session, run_id)
    limit, window = limits.EXPORT_LIMIT
    await limits.enforce(session, who, "export", limit=limit, window_seconds=window)
    codes = body.codes if body.scope is not ExportScope.ALL else None
    rows = (
        await session.execute(
            text(_ROWS.format(filter="and p.code = any(:codes)" if codes is not None else "")),
            {"run": run_id, **({"codes": codes} if codes is not None else {})},
        )
    ).all()
    if codes is not None and not rows:
        raise NotFoundError
    locale = (await session.execute(_LOCALE, {"user_id": who.user_id})).scalar_one_or_none()
    return info, [product_row(r, stock_known=info.stock_known) for r in rows], locale or "es"


async def _record(
    session: AsyncSession, who: Principal, run_id: UUID, meta: dict[str, Any]
) -> None:
    await audit.log_event(session, who, "export.created", "run", run_id, metadata=meta)


async def create_export(tx: Tx, run_id: UUID, body: ExportRequest) -> ExportFile:
    info, rows, locale = await tx.run(_collect, run_id, body)
    file_name = _file_name(info, body)
    path = f"{tx.who.tenant_id}/exports/{uuid4()}/{file_name}"
    storage = tx.container.storage
    await storage.put(path, workbook(rows, locale, stock_known=info.stock_known), XLSX_TYPE)
    signed = await storage.create_download_url(path, ttl_seconds=DOWNLOAD_TTL_SECONDS)
    await tx.run(
        _record,
        run_id,
        {"scope": body.scope.value, "products": len(rows), "format": body.format.value},
    )
    return ExportFile(file_name=file_name, download_url=signed.url, expires_at=signed.expires_at)
