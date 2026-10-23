import { describe, expect, it } from 'vitest'
import type { ProductRow, SeriesPoint } from '../../services/types'
import { COLUMN_TO_SORT, nearestPointDate, SORT_TO_COLUMN, toChartPoints, toTableRow } from './format'

const point = (date: string, extra: Partial<SeriesPoint> = {}): SeriesPoint => ({ date, censored: false, ...extra })

describe('toChartPoints', () => {
  it('maps actuals to history and keeps the forecast band', () => {
    const [past, future] = toChartPoints(
      [point('2026-10-12', { actual: 100 }), point('2026-10-19', { expected: 120, low: 90, high: 150 })],
      'es',
    )
    expect(past).toMatchObject({ date: '2026-10-12', history: 100, expected: null })
    expect(future).toMatchObject({ expected: 120, low: 90, high: 150, history: null })
  })

  it('formats labels in the locale without week codes', () => {
    const [es] = toChartPoints([point('2026-10-12', { actual: 1 })], 'es')
    const [en] = toChartPoints([point('2026-10-12', { actual: 1 })], 'en')
    expect(es.label).toMatch(/12/)
    expect(es.label).toMatch(/oct/i)
    expect(es.label).not.toMatch(/^S\d+/)
    expect(en.label).not.toBe(es.label)
  })
})

describe('nearestPointDate', () => {
  const dates = ['2026-10-12', '2026-10-19', '2026-10-26']
  it('returns the last point on or before today', () => {
    expect(nearestPointDate(dates, '2026-10-23')).toBe('2026-10-19')
    expect(nearestPointDate(dates, '2026-10-26')).toBe('2026-10-26')
  })
  it('returns the first point when today is before the series, and undefined for none', () => {
    expect(nearestPointDate(dates, '2026-01-01')).toBe('2026-10-12')
    expect(nearestPointDate([], '2026-10-23')).toBeUndefined()
  })
})

describe('column and sort names', () => {
  it('round-trips every column', () => {
    for (const [column, sort] of Object.entries(COLUMN_TO_SORT)) expect(SORT_TO_COLUMN[sort]).toBe(column)
  })
})

describe('toTableRow', () => {
  const api = {
    code: 'QF-1',
    name: 'Ácido',
    uom: 'kg',
    abc_class: 'A',
    typical_demand: { low: 1, expected: 2, high: 3 },
    current_stock: 10,
    coverage_weeks: { lower: 1, expected: 5, upper: 6 },
    risk: 'critical',
    reliability: 'high',
    stockout_date: '2026-10-26',
    suggested_quantity: { low: 10, high: 20 },
    suggested_truncated: false,
    buy_before: { action: 'order_by_date', date: '2026-11-02', earliest_date: null, weeks_without_stock: 0 },
    lead_time_days: 21,
    lead_time_overridden: false,
    target_coverage_weeks: 4,
    on_order_quantity: 0,
  } satisfies ProductRow
  const label = (level: string) => `L:${level}`

  it('maps the contract row to the table row', () => {
    expect(toTableRow(api, { today: '2026-10-23', riskLabel: label })).toMatchObject({
      code: 'QF-1',
      abcClass: 'A',
      typicalDemand: 2,
      stock: 10,
      coverageWeeks: 5,
      risk: { level: 'critical', label: 'L:critical' },
      suggestedQuantity: 20,
      leadTimeDays: 21,
    })
    expect(toTableRow(api, { today: '2026-10-23', riskLabel: label }).buyBefore?.toISOString()).toBe('2026-11-02T00:00:00.000Z')
  })

  it('buys today when the action is order_today and never when there is no stockout', () => {
    const today = toTableRow({ ...api, buy_before: { ...api.buy_before, action: 'order_today', date: null } }, { today: '2026-10-23', riskLabel: label })
    expect(today.buyBefore?.toISOString()).toBe('2026-10-23T00:00:00.000Z')
    const none = toTableRow({ ...api, buy_before: { ...api.buy_before, action: 'no_stockout', date: null } }, { today: '2026-10-23', riskLabel: label })
    expect(none.buyBefore).toBeNull()
  })
})
