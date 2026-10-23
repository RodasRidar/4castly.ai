"""Deterministic column matcher by names and types, Spanish and English (LLM fallback, 6c)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from worker.adapters.ingestion.inspector import normalize
from worker.adapters.ingestion.parsing import detect_date_format, detect_decimal_separator
from worker.domain.documents import (
    ColumnProfile,
    ColumnRef,
    DateColumnCandidate,
    DateMapping,
    NormalizationPlan,
    QuantityMapping,
    SheetProfile,
    UnitMapping,
)

DATE: Final = {"fecha", "fechadoc", "fechaemision", "fechaventa", "fechacomprobante", "date", "dia"}
PERIOD: Final = {"periodo", "mes", "month", "anio", "ano", "year", "semana", "week"}
CODE: Final = {
    "codart",
    "codigo",
    "cod",
    "sku",
    "codigoarticulo",
    "codproducto",
    "codigoproducto",
    "item",
    "itemcode",
    "codigoitem",
    "productcode",
    "articulocodigo",
    "codigoart",
}
NAME: Final = {
    "articulo",
    "nombre",
    "descripcion",
    "producto",
    "nombrearticulo",
    "descripcionarticulo",
    "product",
    "productname",
    "detalle",
    "nombreproducto",
}
QUANTITY: Final = {
    "cant",
    "cantidad",
    "qty",
    "quantity",
    "unidades",
    "salida",
    "salidas",
    "cantidadvendida",
    "ventas",
}
STOCK: Final = {
    "stock",
    "saldo",
    "existencia",
    "existencias",
    "inventario",
    "sfinal",
    "stockactual",
    "saldofinal",
}
UNIT: Final = {"unidad", "um", "uom", "unidadmedida", "medida", "unit", "umedida"}
# Customers and suppliers are never mapped: they must not reach a model or a plan (S9).
COUNTERPARTY: Final = {
    "cliente",
    "proveedor",
    "customer",
    "vendedor",
    "razonsocial",
    "ruc",
    "nombrecliente",
    "supplier",
}


@dataclass(frozen=True)
class Proposal:
    plan: NormalizationPlan | None
    unmapped_required: tuple[str, ...] = ()
    needs_date_column: bool = False
    date_column_candidates: tuple[DateColumnCandidate, ...] = ()


def _find(
    columns: list[ColumnProfile], names: set[str], types: set[str], taken: set[str]
) -> ColumnProfile | None:
    for column in columns:
        key = normalize(column.name)
        if column.name in taken or key in COUNTERPARTY or column.inferred_type not in types:
            continue
        if key in names:
            return column
    for column in columns:  # looser: a known word inside a longer name ("fechafactura")
        key = normalize(column.name)
        if column.name in taken or key in COUNTERPARTY or column.inferred_type not in types:
            continue
        if any(len(word) >= 4 and word in key for word in names):  # noqa: PLR2004
            return column
    return None


def _quantity(column: ColumnProfile) -> QuantityMapping:
    return QuantityMapping(column.name, detect_decimal_separator(list(column.samples)))


class DeterministicPlanProposer:
    """`PlanProposer` adapter that needs no network."""

    def propose(self, sheet: SheetProfile) -> Proposal:
        columns = list(sheet.columns)
        taken: set[str] = set()

        def take(names: set[str], types: set[str]) -> ColumnProfile | None:
            found = _find(columns, names, types, taken)
            if found:
                taken.add(found.name)
            return found

        date_col = take(DATE, {"date"})
        code_col = take(CODE, {"text", "number"})
        # "Artículo" is the name when a code column exists, otherwise it is the code.
        name_col = take(NAME, {"text"})
        if code_col is None and name_col is not None and normalize(name_col.name) == "articulo":
            code_col, name_col = name_col, None
        qty_col = take(QUANTITY, {"number"})
        stock_col = take(STOCK, {"number"})
        unit_col = take(UNIT, {"text"})

        unmapped = tuple(
            field
            for field, column in (("product_code", code_col), ("quantity", qty_col))
            if column is None
        )
        if date_col is None:
            candidates = tuple(
                DateColumnCandidate(c.name, c.samples)
                for c in columns
                if c.inferred_type == "date" or normalize(c.name) in PERIOD | DATE
            )
            return Proposal(
                None, unmapped, needs_date_column=True, date_column_candidates=candidates
            )
        if unmapped or code_col is None or qty_col is None:
            return Proposal(None, unmapped)

        date_format = detect_date_format(list(date_col.samples)) or "dd/mm/yyyy"
        plan = NormalizationPlan(
            sheet=sheet.name,
            header_row=sheet.header_row,
            date=DateMapping(date_col.name, date_format),
            product_code=ColumnRef(code_col.name),
            product_name=ColumnRef(name_col.name) if name_col else None,
            quantity=_quantity(qty_col),
            stock=_quantity(stock_col) if stock_col else None,
            unit=UnitMapping(unit_col.name if unit_col else None),
        )
        return Proposal(plan)
