import { describe, expect, it } from 'vitest'
import details from '../../services/mock/fixtures/run-product-details.json'
import type { ProductDetail, ProductProjection } from '../../services/types'
import { firstFutureStockout, pastStockoutDates, toChartPoints, toTableRows } from './productModel'

const all = details as unknown as Record<string, ProductDetail>
const labels = { in_stock: 'Con stock', arrival: 'Llega compra', stockout: 'Sin stock' }
const projections = Object.entries(all).flatMap(([code, d]) => [
  [`${code} sin compra`, d.without_new_purchase!] as const,
  [`${code} con compra`, d.with_suggested_purchase!] as const,
])

describe('pastStockoutDates', () => {
  it('lists the series dates inside zones that ended before today', () => {
    const d = all['QF-0001']
    const dates = pastStockoutDates(d.without_new_purchase!.series, d.without_new_purchase!.stockout_zones, d.today)
    expect(dates).toEqual(['2026-03-16', '2026-08-31'])
  })

  it('ignores zones that are current or in the future', () => {
    const d = all['QF-0001']
    const future = d.without_new_purchase!.stockout_zones.at(-1)!
    expect(pastStockoutDates(d.without_new_purchase!.series, [future], d.today)).toEqual([])
  })
})

describe('firstFutureStockout', () => {
  it('returns the start of the first zone that has not ended yet', () => {
    const d = all['QF-0001']
    expect(firstFutureStockout(d.without_new_purchase!.stockout_zones, d.today)).toBe('2026-10-26')
  })

  it('returns null when nothing is ahead', () => {
    expect(firstFutureStockout([{ start: '2026-01-05', end: '2026-01-11' }], '2026-10-23')).toBeNull()
    expect(firstFutureStockout([], '2026-10-23')).toBeNull()
  })
})

describe('toChartPoints', () => {
  it('maps history, forecast, range and projected stock one to one, with a formatted label', () => {
    const series = all['QF-0001'].without_new_purchase!.series
    const points = toChartPoints(series, (iso) => `L:${iso}`)
    expect(points).toHaveLength(series.length)
    expect(points[0]).toMatchObject({ date: series[0].date, label: `L:${series[0].date}`, history: series[0].actual })
    const last = points.at(-1)!
    const lastSeries = series.at(-1)!
    expect(last).toMatchObject({ expected: lastSeries.expected, low: lastSeries.low, high: lastSeries.high, stock: lastSeries.projected_stock })
  })
})

describe('toTableRows', () => {
  it('passes every contract number through unchanged', () => {
    const weekly = all['QF-0001'].with_suggested_purchase!.weekly
    const rows = toTableRows(weekly, labels)
    expect(rows).toHaveLength(weekly.length)
    rows.forEach((row, i) => {
      const w = weekly[i]
      expect(row.weekStart.toISOString().slice(0, 10)).toBe(w.week_start)
      expect([row.low, row.expected, row.high]).toEqual([w.demand.low, w.demand.expected, w.demand.high])
      expect(row.projectedStock).toBe(w.projected_stock.expected)
      expect(row.shortfall).toBe(w.shortfall.expected)
    })
  })

  it('labels the status and colors it by meaning', () => {
    const rows = toTableRows(all['QF-0001'].with_suggested_purchase!.weekly, labels)
    expect(rows.map((r) => r.status.label)).toContain('Llega compra')
    expect(rows.find((r) => r.status.label === 'Sin stock')?.status.level).toBe('critical')
    expect(rows.find((r) => r.status.label === 'Con stock')?.status.level).toBe('optimal')
  })

  it.each(projections)('keeps %s coherent: a stockout week has a shortfall and an arrival week is marked as one', (_name, projection: ProductProjection) => {
    projection.weekly.forEach((w) => {
      if (w.status === 'stockout') expect(w.shortfall.expected).toBeGreaterThan(0)
      if (w.arrival_quantity > 0) expect(w.status).toBe('arrival')
    })
    toTableRows(projection.weekly, labels).forEach((row, i) => {
      if (projection.weekly[i].status === 'stockout') expect(row.shortfall).toBeGreaterThan(0)
    })
  })
})
