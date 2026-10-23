"""Summary of a Kardex report for the confirmation screen."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from worker.adapters.ingestion.kardex_excel import KardexExcelSource
from worker.domain.documents import DataSummary
from worker.ports.kardex_scanner import KardexScan

MIN_HISTORY_WEEKS = 8


def weeks_between(first: date, last: date) -> int:
    return (last - first).days // 7 + 1


class KardexScanner:
    """`KardexScanner` adapter over the existing Kardex parser."""

    def scan(self, path: Path) -> KardexScan:
        movements = KardexExcelSource(path).read_movements()
        spans: dict[str, list[date]] = {}
        for movement in movements:
            day = movement.timestamp.date()
            first_last = spans.setdefault(movement.sku, [day, day])
            first_last[0], first_last[1] = min(first_last[0], day), max(first_last[1], day)
        first = min((s[0] for s in spans.values()), default=None)
        last = max((s[1] for s in spans.values()), default=None)
        summary = DataSummary(
            products_found=len(spans),
            date_from=first,
            date_to=last,
            history_weeks=weeks_between(first, last) if first and last else 0,
            rows_read=len(movements),
            rows_dropped=0,
        )
        short = sum(weeks_between(a, b) < MIN_HISTORY_WEEKS for a, b in spans.values())
        return KardexScan(summary, short)
