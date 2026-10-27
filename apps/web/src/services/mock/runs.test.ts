import { describe, expect, it } from 'vitest'
import { createMockServices } from '.'
import { NO_STOCK_RUN_ID } from './runs'

const RUN = 'b3984a50-ec9f-5ff8-acdc-763d348729cf'

describe('mock run service', () => {
  it('pages, and reports filtered and unfiltered totals', async () => {
    const { runs } = createMockServices()
    const first = await runs.products(RUN)
    expect(first.items).toHaveLength(25)
    expect(first.page_size).toBe(25)
    expect(first.total).toBe(first.total_unfiltered)
    const second = await runs.products(RUN, { page: 2 })
    expect(second.items.length).toBe(first.total - 25)
  })

  it('searches without caring about accents or case', async () => {
    const { runs } = createMockServices()
    const page = await runs.products(RUN, { q: 'ACIDO citrico' })
    expect(page.items.map((p) => p.name)).toContain('Ácido cítrico anhidro')
  })

  it('filters by risk and class together and sorts critical first by default', async () => {
    const { runs } = createMockServices()
    const all = await runs.products(RUN)
    expect(all.items[0].risk).toBe('critical')
    const page = await runs.products(RUN, { risk: ['critical'], abc: ['A'] })
    expect(page.items.every((p) => p.risk === 'critical' && p.abc_class === 'A')).toBe(true)
    expect(page.total).toBe(page.items.length)
  })

  it('sorts by name in both directions', async () => {
    const { runs } = createMockServices()
    const asc = (await runs.products(RUN, { sort: 'name', order: 'asc' })).items.map((p) => p.name)
    const desc = (await runs.products(RUN, { sort: 'name', order: 'desc' })).items.map((p) => p.name)
    expect(asc[0]).not.toBe(desc[0])
  })

  it('returns product detail and not_found for an unknown code', async () => {
    const { runs } = createMockServices()
    expect((await runs.product(RUN, 'QF-0001')).product.code).toBe('QF-0001')
    await expect(runs.product(RUN, 'NOPE')).rejects.toMatchObject({ problem: { code: 'not_found' } })
  })

  it('simulates lead time and the purchase toggle', async () => {
    const { runs } = createMockServices()
    const without = await runs.simulate(RUN, 'QF-0001', { with_purchase: false, lead_time_days: 21 })
    const withPurchase = await runs.simulate(RUN, 'QF-0001', { with_purchase: true, lead_time_days: 21 })
    expect(without.purchase.lead_time_days).toBe(21)
    expect(withPurchase.projection).not.toEqual(without.projection)
  })

  it('stores a lead time override but only applies it when the next calculation finishes (like the API)', async () => {
    const services = createMockServices()
    const { runs } = services
    expect(await runs.setOverrides('QF-0001', { lead_time_days: 45 })).toEqual({ lead_time_days: 45 })
    const before = (await runs.product(RUN, 'QF-0001')).product
    expect(before.lead_time_days).not.toBe(45)
    const { conversation_id } = await runs.recalculate(RUN)
    expect((await runs.product(RUN, 'QF-0001')).product.lead_time_days).not.toBe(45)
    for (let i = 0; i < 5; i++) services.advance()
    expect((await services.conversations.get(conversation_id)).stage).toBe('ready')
    const after = (await runs.product(RUN, 'QF-0001')).product
    expect(after.lead_time_days).toBe(45)
    expect(after.lead_time_overridden).toBe(true)
  })

  it('replaces the whole override set instead of merging, and clears it when every field is empty', async () => {
    const services = createMockServices()
    const { runs } = services
    const original = (await runs.product(RUN, 'QF-0001')).product
    await runs.setOverrides('QF-0001', { lead_time_days: 45, target_coverage_weeks: 12 })
    await runs.setOverrides('QF-0001', { on_order_quantity: 500 })
    await runs.recalculate(RUN)
    for (let i = 0; i < 5; i++) services.advance()
    const replaced = (await runs.product(RUN, 'QF-0001')).product
    expect(replaced.on_order_quantity).toBe(500)
    // Replace, not merge: the first call's lead time and coverage are gone.
    expect(replaced.lead_time_days).toBe(original.lead_time_days)
    expect(replaced.target_coverage_weeks).toBe(original.target_coverage_weeks)

    await runs.setOverrides('QF-0001', {})
    await runs.recalculate(RUN)
    for (let i = 0; i < 5; i++) services.advance()
    expect((await runs.product(RUN, 'QF-0001')).product.on_order_quantity).toBe(original.on_order_quantity)
  })

  it('marks new parameters as pending (like the API) and puts the conversation back to calculating on recalculate', async () => {
    const services = createMockServices()
    const summary = await services.runs.summary(RUN)
    await services.runs.updateParameters(RUN, { ...summary.run.parameters, horizon_weeks: 24 })
    expect((await services.runs.summary(RUN)).run.parameters_pending).toBe(true)
    const { conversation_id } = await services.runs.recalculate(RUN)
    // The parameters are applied when the calculation finishes, not when it starts.
    expect((await services.runs.summary(RUN)).run.parameters_pending).toBe(true)
    expect((await services.conversations.get(conversation_id)).stage).toBe('calculating')
    for (let i = 0; i < 5; i++) services.advance()
    const done = await services.conversations.get(conversation_id)
    expect((await services.runs.summary(RUN)).run.parameters_pending).toBe(false)
    expect(done.stage).toBe('ready')
    expect(done.current_run_id).toBe(RUN)
  })

  it('fails like the API when told to', async () => {
    const services = createMockServices()
    services.failRun = true
    await expect(services.runs.summary(RUN)).rejects.toMatchObject({ problem: { status: 500 } })
  })
})

describe('mock conversation search', () => {
  it('pages with a cursor, newest first', async () => {
    const { conversations } = createMockServices()
    const first = await conversations.search({ limit: 5 })
    expect(first.items).toHaveLength(5)
    expect(first.nextCursor).toBe('5')
    const second = await conversations.search({ limit: 5, cursor: first.nextCursor })
    expect(second.items.map((c) => c.id)).not.toContain(first.items[0].id)
  })

  it('searches titles and file names without caring about accents', async () => {
    const { conversations } = createMockServices()
    const page = await conversations.search({ q: 'PRONOSTICO' })
    expect(page.items.map((c) => c.title)).toContain('Pronóstico con error')
    expect((await conversations.search({ q: 'kardex_set' })).items).toHaveLength(1)
  })

  it('hides archived conversations unless asked, and deleted ones never', async () => {
    const { conversations } = createMockServices()
    const id = (await conversations.list())[0].id
    await conversations.update(id, { archived: true })
    expect((await conversations.search()).items.map((c) => c.id)).not.toContain(id)
    expect((await conversations.search({ includeArchived: true })).items.map((c) => c.id)).toContain(id)
    await conversations.remove(id)
    expect((await conversations.search({ includeArchived: true })).items.map((c) => c.id)).not.toContain(id)
    await conversations.restore(id)
    expect((await conversations.search({ includeArchived: true })).items.map((c) => c.id)).toContain(id)
  })
})

describe('mock run without stock (D17-C)', () => {
  const services = () => createMockServices({ withoutStock: true })

  it('reports stock_known false and no risk figures', async () => {
    const { runs } = services()
    const summary = await runs.summary(NO_STOCK_RUN_ID)
    expect(summary.stock_known).toBe(false)
    expect(summary.risk_distribution).toBeNull()
    expect(summary.kpis.products_at_risk).toBeNull()
    expect(summary.kpis.average_coverage_weeks).toBeNull()
    expect(summary.kpis.reliability.overall).toBeTruthy()
  })

  it('nulls every stock-dependent field of a row and keeps demand and reliability', async () => {
    const { runs } = services()
    const { items } = await runs.products(NO_STOCK_RUN_ID)
    expect(items.length).toBeGreaterThan(0)
    for (const row of items) {
      expect([row.risk, row.current_stock, row.coverage_weeks, row.suggested_quantity, row.buy_before, row.stockout_date]).toEqual(
        Array(6).fill(null),
      )
      expect(row.typical_demand.expected).toBeGreaterThan(0)
      expect(row.reliability).toBeTruthy()
    }
  })

  it('rejects the risk filter with 422 errors.stockUnknown and sorts by name whatever the sort', async () => {
    const { runs } = services()
    await expect(runs.products(NO_STOCK_RUN_ID, { risk: ['critical'] })).rejects.toMatchObject({
      problem: { status: 422, message_key: 'errors.stockUnknown' },
    })
    const byRisk = (await runs.products(NO_STOCK_RUN_ID, { sort: 'risk' })).items.map((p) => p.name)
    const byName = (await runs.products(NO_STOCK_RUN_ID, { sort: 'name' })).items.map((p) => p.name)
    expect(byRisk).toEqual(byName)
  })

  it('returns the detail without purchase or projections, with the forecast', async () => {
    const { runs } = services()
    const detail = await runs.product(NO_STOCK_RUN_ID, 'QF-0001')
    expect(detail.purchase).toBeNull()
    expect(detail.without_new_purchase).toBeNull()
    expect(detail.with_suggested_purchase).toBeNull()
    expect(detail.product.risk).toBeNull()
    expect(detail.forecast.weekly.length).toBeGreaterThan(0)
    expect(detail.forecast.series.some((p) => p.censored)).toBeDefined()
  })

  it('refuses the what-if with 409 errors.stockUnknown', async () => {
    const { runs } = services()
    await expect(runs.simulate(NO_STOCK_RUN_ID, 'QF-0001', { with_purchase: false })).rejects.toMatchObject({
      problem: { status: 409, message_key: 'errors.stockUnknown' },
    })
  })
})
