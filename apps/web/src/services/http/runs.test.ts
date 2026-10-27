import { describe, expect, it, vi } from 'vitest'
import runProducts from '../mock/fixtures/run-products.json'
import runSummary from '../mock/fixtures/run-summary.json'
import runDetails from '../mock/fixtures/run-product-details.json'
import entryFlow from '../mock/fixtures/entry-flow.json'
import { ApiFailure, type ExportRequest } from '../types'
import { createHttpClient } from './client'
import { createHttpRunService } from './runs'

const RUN = 'b3984a50-ec9f-5ff8-acdc-763d348729cf'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(respond: (url: URL, init: RequestInit) => Response) {
  const calls: { url: URL; init: RequestInit; body: unknown }[] = []
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
    return respond(url, init)
  })
  const client = createHttpClient({
    baseUrl: 'https://api.example.test',
    getToken: async () => 'tok',
    fetch: fetchStub as unknown as typeof fetch,
  })
  return { runs: createHttpRunService(client), calls }
}

describe('http run service', () => {
  it('GET summary', async () => {
    const { runs, calls } = setup(() => json(runSummary))
    expect(await runs.summary(RUN)).toEqual(runSummary)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/summary`)
  })

  it('sends no query when the product query is empty', async () => {
    const { runs, calls } = setup(() => json({ items: [], page: 1, page_size: 25, total: 0, total_unfiltered: 0 }))
    await runs.products(RUN)
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/products`)
    expect(calls[0].url.search).toBe('')
  })

  it('maps the product query to the API parameters, repeating risk and abc', async () => {
    const { runs, calls } = setup(() => json({ items: runProducts.items, page: 2, page_size: 10, total: 26, total_unfiltered: 26 }))
    await runs.products(RUN, {
      q: 'ácido',
      risk: ['critical', 'medium'],
      abc: ['A', 'B'],
      sort: 'coverage',
      order: 'desc',
      page: 2,
      pageSize: 10,
    })
    const params = calls[0].url.searchParams
    expect(params.get('q')).toBe('ácido')
    expect(params.getAll('risk')).toEqual(['critical', 'medium'])
    expect(params.getAll('abc')).toEqual(['A', 'B'])
    expect(params.get('sort')).toBe('coverage')
    expect(params.get('order')).toBe('desc')
    expect(params.get('page')).toBe('2')
    expect(params.get('page_size')).toBe('10')
    expect([...params.keys()].sort()).toEqual(['abc', 'abc', 'order', 'page', 'page_size', 'q', 'risk', 'risk', 'sort'])
  })

  it('leaves out empty filters instead of sending blank parameters', async () => {
    const { runs, calls } = setup(() => json({ items: [], page: 1, page_size: 25, total: 0, total_unfiltered: 0 }))
    await runs.products(RUN, { q: '', risk: [], abc: [] })
    expect(calls[0].url.search).toBe('')
  })

  it('GET product detail, encoding the code in the path', async () => {
    const detail = (runDetails as Record<string, unknown>)['QF-0001']
    const { runs, calls } = setup(() => json(detail))
    await runs.product(RUN, 'QF-0001')
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/products/QF-0001`)
    await runs.product(RUN, 'A/B 7%')
    expect(calls[1].url.pathname).toBe(`/v1/runs/${RUN}/products/A%2FB%207%25`)
  })

  it('POST simulate with the request body', async () => {
    const result = { product: runProducts.items[0], purchase: {}, projection: {} }
    const { runs, calls } = setup(() => json(result))
    const request = { lead_time_days: 21, target_coverage_weeks: 8, with_purchase: true }
    expect(await runs.simulate(RUN, 'QF-0001', request)).toEqual(result)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/products/QF-0001/simulate`)
    expect(calls[0].body).toEqual(request)
  })

  it('PUT parameters and returns the saved values', async () => {
    const parameters = runSummary.run.parameters
    const { runs, calls } = setup(() => json(parameters))
    expect(await runs.updateParameters(RUN, parameters as never)).toEqual(parameters)
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/parameters`)
    expect(calls[0].body).toEqual(parameters)
  })

  it('POST recalculate without a body and returns the accepted job', async () => {
    const accepted = entryFlow.forecast_accepted
    const { runs, calls } = setup(() => json(accepted, 202))
    expect(await runs.recalculate(RUN)).toEqual(accepted)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/recalculate`)
    expect(calls[0].init.body).toBeUndefined()
  })

  it('PUT product overrides under /v1/products, encoding the code', async () => {
    const { runs, calls } = setup(() => json({ lead_time_days: 45 }))
    expect(await runs.setOverrides('QF 0001', { lead_time_days: 45 })).toEqual({ lead_time_days: 45 })
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].url.pathname).toBe('/v1/products/QF%200001/overrides')
    expect(calls[0].body).toEqual({ lead_time_days: 45 })
  })

  it('POST exports (201) with scope and codes', async () => {
    const file = { file_name: 'pronostico.xlsx', download_url: 'https://storage.example.invalid/x', expires_at: '2026-10-23T10:00:00Z', format: 'xlsx' }
    const { runs, calls } = setup(() => json(file, 201))
    const request: ExportRequest = { format: 'xlsx', scope: 'selection', codes: ['QF-0001', 'QF-0002'] }
    expect(await runs.createExport(RUN, request)).toEqual(file)
    expect(calls[0].url.pathname).toBe(`/v1/runs/${RUN}/exports`)
    expect(calls[0].body).toEqual(request)
  })

  it('rejects with the API problem when the run is unknown', async () => {
    const { runs } = setup(
      () =>
        new Response(
          JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found', message_key: 'errors.notFound', ref: 'K7Q2WX' }),
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        ),
    )
    const error = await runs.summary(RUN).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).problem).toMatchObject({ status: 404, ref: 'K7Q2WX' })
  })

  it('surfaces a conflict when parameters cannot be saved', async () => {
    const { runs } = setup(
      () =>
        new Response(
          JSON.stringify({ type: 'about:blank', title: 'Conflict', status: 409, code: 'conflict', message_key: 'errors.runSuperseded', ref: 'AB12CD' }),
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
    )
    await expect(runs.updateParameters(RUN, runSummary.run.parameters as never)).rejects.toMatchObject({
      problem: { status: 409, message_key: 'errors.runSuperseded' },
    })
  })
})
