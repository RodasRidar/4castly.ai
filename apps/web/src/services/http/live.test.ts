/**
 * Opt-in contract test against a running API. Skipped unless LIVE_API_FILE points at a JSON file with
 * `{ apiUrl, token, runId, runConversation, digestingConversation }` (a throw-away API on an ephemeral
 * database: it mutates data). It checks that the real services speak the real API: paths, params, headers,
 * response shapes, SSE framing and error bodies.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createHttpServices } from '.'
import { ApiFailure, type ChatStreamEvent } from '../types'

const file = process.env.LIVE_API_FILE
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : null

const authWith = (token: string | null) =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) } }) as never

function services(token: string | null = live?.token ?? null, onUnauthorized: () => void = () => {}) {
  return createHttpServices({ apiUrl: live!.apiUrl, supabase: authWith(token), onUnauthorized })
}

describe.skipIf(!live)('against the real API', () => {
  it('reads the profile and round-trips preferences with the PUT-merge', async () => {
    const { profile } = services()
    const me = await profile.getMe()
    expect(me.email).toBe(live!.email)
    const before = await profile.getPreferences()
    const saved = await profile.updatePreferences({ theme: 'dark' })
    expect(saved).toEqual({ ...before, theme: 'dark' })
    expect((await profile.getPreferences()).theme).toBe('dark')
    expect((await profile.updateMe({ full_name: 'Ana Test' })).full_name).toBe('Ana Test')
  })

  it('lists, searches, renames, archives, deletes and restores conversations', async () => {
    const { conversations } = services()
    // Runs may repeat against the same throw-away database: start from the seeded title, not archived.
    await conversations.update(live!.digestingConversation, { archived: false, title: 'Seeded digesting' })
    const list = await conversations.list()
    expect(list.map((c) => c.id)).toContain(live!.digestingConversation)
    const found = await conversations.search({ q: 'seeded' })
    expect(found.items.map((c) => c.id)).toEqual([live!.digestingConversation])
    expect((await conversations.get(live!.digestingConversation)).stage).toBe('digesting')
    expect((await conversations.update(live!.digestingConversation, { title: 'Renamed' })).title).toBe('Renamed')
    await conversations.update(live!.digestingConversation, { archived: true })
    expect((await conversations.search({ q: 'Renamed' })).items).toHaveLength(0)
    expect((await conversations.search({ q: 'Renamed', includeArchived: true })).items).toHaveLength(1)
    await conversations.remove(live!.digestingConversation)
    await expect(conversations.get(live!.digestingConversation)).rejects.toMatchObject({ problem: { status: 404 } })
    expect((await conversations.restore(live!.digestingConversation)).id).toBe(live!.digestingConversation)
  })

  it('serves the run summary, the filtered table, a product and a simulation', async () => {
    const { runs } = services()
    const summary = await runs.summary(live!.runId)
    expect(summary.kpis.products_at_risk.count).toBeGreaterThanOrEqual(0)
    expect(typeof summary.stock_known).toBe('boolean')
    expect(typeof summary.run.parameters_pending).toBe('boolean')
    const page = await runs.products(live!.runId, { sort: 'risk', order: 'asc', page: 1 })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.total).toBe(page.total_unfiltered)
    const critical = await runs.products(live!.runId, { risk: ['critical', 'medium'], abc: ['A', 'B'] })
    expect(critical.items.every((p) => p.risk !== 'optimal' && p.abc_class !== 'C')).toBe(true)
    const code = page.items[0].code
    const detail = await runs.product(live!.runId, code)
    expect(detail.product.code).toBe(code)
    const sim = await runs.simulate(live!.runId, code, { with_purchase: true, lead_time_days: 30 })
    expect(sim.purchase.lead_time_days).toBe(30)
  })

  it('stores overrides without applying them, and a second PUT replaces the first instead of merging', async () => {
    const { runs } = services()
    const page = await runs.products(live!.runId, { sort: 'name', order: 'asc' })
    const row = page.items[0]
    // The API applies overrides the next time results are calculated (apps/api services/overrides.py), and no
    // worker runs here: the stored value must NOT show up in the product row.
    const first = await runs.setOverrides(row.code, { lead_time_days: 33 })
    expect(first.lead_time_days).toBe(33)
    expect((await runs.product(live!.runId, row.code)).product.lead_time_days).toBe(row.lead_time_days)
    // PUT replaces the whole set: the echo of a second call has no trace of the lead time.
    const second = await runs.setOverrides(row.code, { target_coverage_weeks: 10 })
    expect(second.target_coverage_weeks).toBe(10)
    expect(second.lead_time_days ?? null).toBeNull()
    // An empty body clears the overrides.
    const cleared = await runs.setOverrides(row.code, {})
    expect(cleared.lead_time_days ?? null).toBeNull()
    expect(cleared.target_coverage_weeks ?? null).toBeNull()
  })

  it('marks new parameters as pending and exports to Excel', async () => {
    const { runs } = services()
    const summary = await runs.summary(live!.runId)
    await runs.updateParameters(live!.runId, { ...summary.run.parameters, horizon_weeks: 24 })
    expect((await runs.summary(live!.runId)).run.parameters_pending).toBe(true)
    const file = await runs.createExport(live!.runId, { format: 'xlsx', scope: 'all' })
    expect(file.file_name).toMatch(/\.xlsx$/)
    expect(file.download_url).toMatch(/^https?:\/\//)
  })

  it('streams a chat answer, lists the transcript in order, records feedback and stops cleanly', async () => {
    const { chat } = services()
    const events: ChatStreamEvent[] = []
    for await (const event of chat.send(live!.runConversation, { text: '¿Qué debo comprar primero?' })) events.push(event)
    expect(events[0].event).toBe('message.start')
    expect(events.at(-1)?.event).toBe('message.end')
    const text = events.filter((e) => e.event === 'text.delta').map((e) => (e as { text: string }).text).join('')
    expect(text.length).toBeGreaterThan(0)
    const list = await chat.list(live!.runConversation)
    const assistant = list.filter((m) => m.role === 'assistant').at(-1)!
    expect(assistant.display_text).toBe(text)
    expect(list.at(-2)?.display_text).toBe('¿Qué debo comprar primero?')
    expect(await chat.feedback(assistant.id, 'up')).toMatchObject({ message_id: assistant.id, value: 'up' })
    const retried: ChatStreamEvent[] = []
    for await (const event of chat.retry(assistant.id)) retried.push(event)
    expect(retried.at(-1)?.event).toBe('message.end')
    const after = await chat.list(live!.runConversation)
    expect(after.filter((m) => m.role === 'assistant').length).toBeGreaterThan(list.filter((m) => m.role === 'assistant').length)
  })

  it('creates an upload ticket and refuses to complete an object that was never uploaded', async () => {
    const { uploads } = services()
    const ticket = await uploads.create({
      file_name: 'ventas.xlsx',
      size_bytes: 2048,
      content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    expect(ticket.method).toBe('PUT')
    expect(ticket.upload_url).toMatch(/^https?:\/\//)
    const failure = await uploads.complete(ticket.upload_id).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiFailure)
    expect((failure as ApiFailure).problem.message_key).toMatch(/^errors\./)
  })

  it('downloads the sales template with the session token', async () => {
    const { uploads } = services()
    const template = await uploads.downloadTemplate()
    expect(template.blob.size).toBeGreaterThan(0)
    expect(template.fileName).toMatch(/\.xlsx$/)
  })

  it('reports problems as ApiFailure with a reference, and a bad token as 401', async () => {
    const unknown = await services().conversations.get('00000000-0000-0000-0000-000000000000').catch((e: unknown) => e)
    expect(unknown).toBeInstanceOf(ApiFailure)
    expect((unknown as ApiFailure).problem).toMatchObject({ status: 404, code: expect.any(String), message_key: 'errors.notFound' })
    expect((unknown as ApiFailure).problem.ref).not.toBe('')
    const onUnauthorized = vi.fn()
    const denied = await services('not-a-jwt', onUnauthorized).profile.getMe().catch((e: unknown) => e)
    expect((denied as ApiFailure).problem.status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('allows the web origin through CORS', async () => {
    const response = await fetch(`${live!.apiUrl}/v1/me`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization')
  })
})
