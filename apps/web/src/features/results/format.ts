import type { ChartPoint } from '../../ui/organisms/ForecastChart'
import type { ProductColumnId, ProductRow as TableRow } from '../../ui/organisms/ProductTable'
import type { ProductRow, ProductSort, RiskLevel, SeriesPoint } from '../../services/types'

/** The API sends calendar dates (`YYYY-MM-DD`), so they are read and formatted in UTC to never shift a day. */
export const calendarDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

export function toChartPoints(points: SeriesPoint[], locale: string): ChartPoint[] {
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return points.map((p) => ({
    date: p.date,
    label: fmt.format(calendarDate(p.date)),
    history: p.actual ?? null,
    expected: p.expected ?? null,
    low: p.low ?? null,
    high: p.high ?? null,
  }))
}

/** Dates of past stockouts: periods whose demand was censored. */
export const stockoutDates = (points: SeriesPoint[]) => points.filter((p) => p.censored).map((p) => p.date)

/** The chart marks "Hoy" on a point, so pick the last point on or before today (or the first one). */
export function nearestPointDate(dates: string[], today: string): string | undefined {
  if (dates.length === 0) return undefined
  const sorted = [...dates].sort()
  return [...sorted].reverse().find((d) => d <= today) ?? sorted[0]
}

export const COLUMN_TO_SORT: Record<ProductColumnId, ProductSort> = {
  name: 'name',
  abc: 'abc_class',
  demand: 'typical_demand',
  stock: 'current_stock',
  coverage: 'coverage',
  risk: 'risk',
  suggested: 'suggested_quantity',
  buyBefore: 'buy_before',
  leadTime: 'lead_time',
}

export const SORT_TO_COLUMN = Object.fromEntries(Object.entries(COLUMN_TO_SORT).map(([column, sort]) => [sort, column])) as Record<
  ProductSort,
  ProductColumnId
>

interface RowContext {
  /** Run's "today", a calendar date. */
  today: string
  riskLabel: (level: RiskLevel) => string
  leadTimeStatus?: TableRow['leadTimeStatus']
}

/** The suggested quantity is a range; the table shows its upper end so the high scenario is covered. */
export function toTableRow(p: ProductRow, { today, riskLabel, leadTimeStatus }: RowContext): TableRow {
  const buyBefore = p.buy_before
  return {
    code: p.code,
    name: p.name,
    abcClass: p.abc_class,
    typicalDemand: p.typical_demand.expected,
    stock: p.current_stock,
    coverageWeeks: p.coverage_weeks?.expected ?? null,
    risk: p.risk ? { level: p.risk, label: riskLabel(p.risk) } : null,
    suggestedQuantity: p.suggested_quantity?.high ?? null,
    buyBefore:
      buyBefore?.action === 'order_today'
        ? calendarDate(today)
        : buyBefore?.action === 'order_by_date' && buyBefore.date
          ? calendarDate(buyBefore.date)
          : null,
    leadTimeDays: p.lead_time_days,
    leadTimeStatus,
  }
}
