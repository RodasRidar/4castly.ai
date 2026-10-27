import { describe, expect, it } from 'vitest'
import { createMockServices } from '.'

const RUN = 'b3984a50-ec9f-5ff8-acdc-763d348729cf'

describe('mock run service', () => {
  it('pages, and reports filtered and unfiltered totals', async () => {
    const { runs } = createMockServices()
    const first = await runs.products(RUN)
    expect(first.items).toHaveLength(20)
    expect(first.total).toBe(first.total_unfiltered)
    const second = await runs.products(RUN, { page: 2 })
    expect(second.items.length).toBe(first.total - 20)
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

  it('keeps a per-product lead time override', async () => {
    const { runs } = createMockServices()
    await runs.setOverrides('QF-0001', { lead_time_days: 45 })
    const detail = await runs.product(RUN, 'QF-0001')
    expect(detail.product.lead_time_days).toBe(45)
    expect(detail.product.lead_time_overridden).toBe(true)
  })

  it('marks new parameters as pending (like the API) and puts the conversation back to calculating on recalculate', async () => {
    const services = createMockServices()
    const summary = await services.runs.summary(RUN)
    await services.runs.updateParameters(RUN, { ...summary.run.parameters, horizon_weeks: 24 })
    expect((await services.runs.summary(RUN)).run.parameters_pending).toBe(true)
    const { conversation_id } = await services.runs.recalculate(RUN)
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
