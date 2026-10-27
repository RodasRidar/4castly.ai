import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from '../types'
import { createHttpClient } from './client'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
const problem = (status: number, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({ type: 'about:blank', title: 't', status, code: 'not_found', message_key: 'errors.notFound', ref: 'K7Q2WX', ...extra }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

function setup(respond: (url: string, init: RequestInit) => Response | Promise<Response>, over: Partial<Parameters<typeof createHttpClient>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init })
    return respond(String(input), init)
  })
  const client = createHttpClient({
    baseUrl: 'https://api.example.test',
    getToken: async () => 'tok-123',
    fetch: fetchStub as unknown as typeof fetch,
    ...over,
  })
  return { client, calls, fetchStub }
}

describe('http client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const { client, calls } = setup(() => json({ hello: 'world' }))
    await expect(client.json('GET', '/v1/me')).resolves.toEqual({ hello: 'world' })
    expect(calls[0].url).toBe('https://api.example.test/v1/me')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer tok-123')
  })

  it('omits the authorization header when there is no session', async () => {
    const { client, calls } = setup(() => json({}), { getToken: async () => null })
    await client.json('GET', '/v1/me')
    expect(new Headers(calls[0].init.headers).has('authorization')).toBe(false)
  })

  it('does not double the slash between base URL and path', async () => {
    const { client, calls } = setup(() => json({}), { baseUrl: 'https://api.example.test/' })
    await client.json('GET', '/v1/me')
    expect(calls[0].url).toBe('https://api.example.test/v1/me')
  })

  it('serializes query values, repeating arrays and skipping empties', async () => {
    const { client, calls } = setup(() => json({}))
    await client.json('GET', '/v1/runs/r/products', {
      query: { q: 'ácido', risk: ['critical', 'medium'], abc: [], page: 2, sort: undefined, order: null, flag: false },
    })
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('q')).toBe('ácido')
    expect(url.searchParams.getAll('risk')).toEqual(['critical', 'medium'])
    expect(url.searchParams.has('abc')).toBe(false)
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.has('sort')).toBe(false)
    expect(url.searchParams.has('order')).toBe(false)
    expect(url.searchParams.get('flag')).toBe('false')
  })

  it('sends a JSON body with its content type and extra headers', async () => {
    const { client, calls } = setup(() => json({ ok: true }))
    await client.json('POST', '/v1/uploads/u/complete', { body: { a: 1 }, headers: { 'Idempotency-Key': 'k1' } })
    const headers = new Headers(calls[0].init.headers)
    expect(calls[0].init.method).toBe('POST')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('idempotency-key')).toBe('k1')
    expect(calls[0].init.body).toBe('{"a":1}')
  })

  it('returns undefined for 204', async () => {
    const { client } = setup(() => new Response(null, { status: 204 }))
    await expect(client.json('DELETE', '/v1/conversations/c')).resolves.toBeUndefined()
  })

  it('turns a problem+json body into an ApiFailure with its ref', async () => {
    const { client } = setup(() => problem(404))
    const error = await client.json('GET', '/v1/conversations/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).problem).toMatchObject({ status: 404, code: 'not_found', ref: 'K7Q2WX' })
  })

  it('keeps field issues from a validation problem', async () => {
    const { client } = setup(() => problem(422, { code: 'validation_error', fields: [{ field: 'full_name', code: 'string_too_short' }] }))
    const error = (await client.json('PATCH', '/v1/me', { body: {} }).catch((e: unknown) => e)) as ApiFailure
    expect(error.problem.fields).toEqual([{ field: 'full_name', code: 'string_too_short' }])
  })

  it('wraps a non-problem error body into a generic failure', async () => {
    const { client } = setup(() => new Response('<html>bad gateway</html>', { status: 502 }))
    const error = (await client.json('GET', '/v1/me').catch((e: unknown) => e)) as ApiFailure
    expect(error).toBeInstanceOf(ApiFailure)
    expect(error.problem).toMatchObject({ status: 502, code: 'http_error', message_key: 'errors.internal' })
  })

  it('reports a network failure as an ApiFailure instead of a TypeError', async () => {
    const { client } = setup(() => {
      throw new TypeError('Failed to fetch')
    })
    const error = (await client.json('GET', '/v1/me').catch((e: unknown) => e)) as ApiFailure
    expect(error).toBeInstanceOf(ApiFailure)
    expect(error.problem).toMatchObject({ status: 0, code: 'network_error', message_key: 'errors.network' })
  })

  it('calls onUnauthorized once for a 401 and still throws', async () => {
    const onUnauthorized = vi.fn()
    const { client } = setup(() => problem(401, { code: 'unauthorized', message_key: 'errors.unauthorized' }), { onUnauthorized })
    await expect(client.json('GET', '/v1/me')).rejects.toBeInstanceOf(ApiFailure)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('passes the abort signal through and does not wrap an abort', async () => {
    const controller = new AbortController()
    const { client } = setup((_url, init) => {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return json({})
    })
    controller.abort()
    await expect(client.json('GET', '/v1/me', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('stream() returns the response for event streams and throws for problems', async () => {
    const ok = setup(() => new Response('event: x\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }))
    const res = await ok.client.stream('POST', '/v1/conversations/c/messages', { body: { text: 'hola' } })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(new Headers(ok.calls[0].init.headers).get('accept')).toBe('text/event-stream')
    const bad = setup(() => problem(503, { code: 'assistant_unavailable' }))
    await expect(bad.client.stream('POST', '/v1/conversations/c/messages', { body: {} })).rejects.toBeInstanceOf(ApiFailure)
  })

  it('blob() downloads a file with the bearer token and reads the file name', async () => {
    const { client, calls } = setup(
      () => new Response('xlsx-bytes', { headers: { 'content-disposition': 'attachment; filename="plantilla-ventas.xlsx"' } }),
    )
    const file = await client.blob('GET', '/v1/templates/sales.xlsx')
    expect(await file.blob.text()).toBe('xlsx-bytes')
    expect(file.fileName).toBe('plantilla-ventas.xlsx')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer tok-123')
  })

  it('blob() has no file name when the server sends none, and throws problems like json()', async () => {
    expect((await setup(() => new Response('x')).client.blob('GET', '/x')).fileName).toBeNull()
    await expect(setup(() => problem(404)).client.blob('GET', '/x')).rejects.toBeInstanceOf(ApiFailure)
  })
})
