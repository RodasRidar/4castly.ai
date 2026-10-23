import type { ChartPoint } from '../../ui/organisms/ForecastChart.helpers'
import type { WeeklyProjectionRow as TableRow } from '../../ui/organisms/WeeklyProjectionTable'
import type { ProductProjection, RiskLevel, SeriesPoint, WeeklyProjectionRow } from '../../services/types'

type DateSpan = ProductProjection['stockout_zones'][number]

/** Series dates that fall inside a stockout zone that ended before `today` (past stockouts, drawn on the chart). */
export function pastStockoutDates(series: SeriesPoint[], zones: DateSpan[], today: string): string[] {
  const past = zones.filter((zone) => zone.end < today)
  return series.filter((p) => past.some((zone) => p.date >= zone.start && p.date <= zone.end)).map((p) => p.date)
}

/** Start of the first zone that has not ended yet, or null when no stockout is ahead. */
export function firstFutureStockout(zones: DateSpan[], today: string): string | null {
  const ahead = zones.filter((zone) => zone.end >= today).sort((a, b) => a.start.localeCompare(b.start))
  return ahead[0]?.start ?? null
}

/** One chart point per series point. Numbers are the contract's; only the label is formatted here. */
export function toChartPoints(series: SeriesPoint[], formatLabel: (iso: string) => string): ChartPoint[] {
  return series.map((p) => ({
    date: p.date,
    label: formatLabel(p.date),
    history: p.actual ?? null,
    expected: p.expected ?? null,
    low: p.low ?? null,
    high: p.high ?? null,
    stock: p.projected_stock ?? null,
  }))
}

const STATUS_LEVEL: Record<WeeklyProjectionRow['status'], RiskLevel> = {
  in_stock: 'optimal',
  arrival: 'optimal',
  stockout: 'critical',
}

/** Weekly table rows: expected-scenario stock and shortfall, with the status colored by meaning. */
export function toTableRows(weekly: WeeklyProjectionRow[], statusLabels: Record<WeeklyProjectionRow['status'], string>): TableRow[] {
  return weekly.map((w) => ({
    weekStart: new Date(w.week_start),
    low: w.demand.low,
    expected: w.demand.expected,
    high: w.demand.high,
    projectedStock: w.projected_stock.expected,
    shortfall: w.shortfall.expected,
    status: { level: STATUS_LEVEL[w.status], label: statusLabels[w.status] },
  }))
}
