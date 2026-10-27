import { describe, expect, it, vi } from 'vitest'
import conversationsFx from '../mock/fixtures/conversations.json'
import entryFlow from '../mock/fixtures/entry-flow.json'
import errorsFx from '../mock/fixtures/errors.json'
import sessionFx from '../mock/fixtures/session.json'
import { supabase } from '../../lib/supabase'
import { ApiFailure } from '../types'
import type { AuthClient } from './auth'
import { createHttpClient } from './client'
import { createHttpConversationService } from './conversations'
import { createHttpServices } from './index'
import { createHttpJobService } from './jobs'
import { createHttpProfileService } from './profile'
import { createHttpUploadService } from './uploads'

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
const problem = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })

interface Call {
  url: URL
  method: string
  headers: Headers
  body: unknown
}

/** A fetch that answers from a queue and records every request. */
function fakeApi(...responses: Response[]) {
  const calls: Call[] = []
  const queue = [...responses]
  const fetchStub = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({
      url: new URL(String(input)),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    })
    const next = queue.shift()
    if (!next) throw new Error('unexpected request')
    return next
  }) as typeof fetch
  const client = createHttpClient({ baseUrl: 'https://api.example.test', getToken: async () => 'tok', fetch: fetchStub })
  return { client, calls }
}

const details = conversationsFx.details as unknown as { id: string }[]
const CONVERSATION = details[0].id
const fails = async (promise: Promise<unknown>) => (await promise.then(() => null, (e: unknown) => e)) as ApiFailure

describe('profile', () => {
  it('reads and patches the user', async () => {
    const { client, calls } = fakeApi(json(sessionFx.user), json({ ...sessionFx.user, job_title: 'Directora' }))
    const profile = createHttpProfileService(client)
    expect((await profile.getMe()).email).toBe('ana.torres@example.com')
    expect((await profile.updateMe({ job_title: 'Directora' })).job_title).toBe('Directora')
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([['GET', '/v1/me'], ['PATCH', '/v1/me']])
    expect(calls[1].body).toEqual({ job_title: 'Directora' })
  })

  it('reads preferences', async () => {
    const { client, calls } = fakeApi(json(sessionFx.preferences))
    expect(await createHttpProfileService(client).getPreferences()).toEqual(sessionFx.preferences)
    expect([calls[0].method, calls[0].url.pathname]).toEqual(['GET', '/v1/me/preferences'])
  })

  it('merges a preference patch over the current values and PUTs the whole object', async () => {
    const saved = { ...sessionFx.preferences, theme: 'dark' }
    const { client, calls } = fakeApi(json(sessionFx.preferences), json(saved))
    const result = await createHttpProfileService(client).updatePreferences({ theme: 'dark' })
    expect(result).toEqual(saved)
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([['GET', '/v1/me/preferences'], ['PUT', '/v1/me/preferences']])
    expect(calls[1].body).toEqual(saved)
  })

  it('propagates a validation problem with its field issues', async () => {
    const { client } = fakeApi(problem(422, errorsFx.validation))
    const failure = await fails(createHttpProfileService(client).updateMe({ full_name: 'A' }))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure.problem.fields).toEqual([{ field: 'full_name', code: 'string_too_short' }])
  })
})

describe('conversations', () => {
  const page = conversationsFx.page

  it('lists the first page for the sidebar: 100 per page, archived excluded', async () => {
    const { client, calls } = fakeApi(json(page))
    const items = await createHttpConversationService(client).list()
    expect(items).toHaveLength(page.items.length)
    expect(calls[0].url.pathname).toBe('/v1/conversations')
    expect(calls[0].url.searchParams.get('limit')).toBe('100')
    expect(calls[0].url.searchParams.has('include_archived')).toBe(false)
  })

  it('searches the history with text, archived ones and a cursor', async () => {
    const { client, calls } = fakeApi(json({ items: page.items.slice(0, 2), next_cursor: 'c2' }))
    const result = await createHttpConversationService(client).search({ q: 'ácido', includeArchived: true, cursor: 'c1', limit: 30 })
    expect(result).toEqual({ items: page.items.slice(0, 2), nextCursor: 'c2' })
    const q = calls[0].url.searchParams
    expect([q.get('q'), q.get('include_archived'), q.get('cursor'), q.get('limit')]).toEqual(['ácido', 'true', 'c1', '30'])
  })

  it('searches without parameters it was not given', async () => {
    const { client, calls } = fakeApi(json({ items: [], next_cursor: null }))
    const result = await createHttpConversationService(client).search()
    expect(result).toEqual({ items: [], nextCursor: null })
    expect([...calls[0].url.searchParams.keys()]).toEqual([])
  })

  it('gets one conversation and encodes its id', async () => {
    const { client, calls } = fakeApi(json(details[0]))
    await createHttpConversationService(client).get('a/b c')
    expect(calls[0].url.pathname).toBe('/v1/conversations/a%2Fb%20c')
  })

  it('patches title, pin and archive', async () => {
    const { client, calls } = fakeApi(json(conversationsFx.page.items[0]))
    await createHttpConversationService(client).update(CONVERSATION, { title: 'Nuevo', pinned: true, archived: false })
    expect([calls[0].method, calls[0].url.pathname]).toEqual(['PATCH', `/v1/conversations/${CONVERSATION}`])
    expect(calls[0].body).toEqual({ title: 'Nuevo', pinned: true, archived: false })
  })

  it('soft-deletes (204) and restores', async () => {
    const { client, calls } = fakeApi(new Response(null, { status: 204 }), json(conversationsFx.page.items[0]))
    const service = createHttpConversationService(client)
    await expect(service.remove(CONVERSATION)).resolves.toBeUndefined()
    expect((await service.restore(CONVERSATION)).id).toBe(conversationsFx.page.items[0].id)
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([
      ['DELETE', `/v1/conversations/${CONVERSATION}`],
      ['POST', `/v1/conversations/${CONVERSATION}/restore`],
    ])
  })

  it('reads and confirms the plan', async () => {
    const plan = entryFlow.plans.tabular_confirmed
    const { client, calls } = fakeApi(json(entryFlow.plans.tabular_proposed), json(plan))
    const service = createHttpConversationService(client)
    await service.getPlan(CONVERSATION)
    await service.confirmPlan(CONVERSATION, { plan: plan.plan as never })
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([
      ['GET', `/v1/conversations/${CONVERSATION}/plan`],
      ['PUT', `/v1/conversations/${CONVERSATION}/plan`],
    ])
    expect(calls[1].body).toEqual({ plan: plan.plan })
  })

  it('starts a forecast with a fresh idempotency key every time', async () => {
    const accepted = entryFlow.forecast_accepted
    const { client, calls } = fakeApi(json(accepted, { status: 202 }), json(accepted, { status: 202 }))
    const service = createHttpConversationService(client)
    await expect(service.startForecast(CONVERSATION, { skip: true })).resolves.toEqual(accepted)
    await service.startForecast(CONVERSATION, { skip: false, answers: { lead_time_days: 21, had_stockouts: 'no' } })
    expect([calls[0].method, calls[0].url.pathname]).toEqual(['POST', `/v1/conversations/${CONVERSATION}/forecast`])
    expect(calls[0].body).toEqual({ skip: true })
    expect(calls[1].body).toEqual({ skip: false, answers: { lead_time_days: 21, had_stockouts: 'no' } })
    const keys = calls.map((c) => c.headers.get('idempotency-key'))
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('turns a 404 into an ApiFailure the screens can match on', async () => {
    const { client } = fakeApi(problem(404, errorsFx.not_found))
    const failure = await fails(createHttpConversationService(client).get(CONVERSATION))
    expect(failure.problem).toMatchObject({ status: 404, code: 'not_found', ref: 'K7Q2WX' })
  })
})

/** Just enough XMLHttpRequest for the upload service. */
class FakeXhr {
  static instances: FakeXhr[] = []
  static script: (xhr: FakeXhr) => void = (xhr) => xhr.finish(200)
  method = ''
  url = ''
  headers: Record<string, string> = {}
  sent: unknown = null
  status = 0
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value
  }
  send(body: unknown) {
    this.sent = body
    FakeXhr.script(this)
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  finish(status: number) {
    this.status = status
    this.onload?.()
  }
}

const createXhr = () => new FakeXhr() as unknown as XMLHttpRequest
const ticket = entryFlow.upload_ticket as unknown as Parameters<ReturnType<typeof createHttpUploadService>['put']>[0]
const file = new File(['data'], 'ventas.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

describe('uploads', () => {
  it('asks for a signed upload ticket', async () => {
    const body = { file_name: 'ventas.xlsx', size_bytes: 4, content_type: file.type }
    const { client, calls } = fakeApi(json(ticket, { status: 201 }))
    const result = await createHttpUploadService(client, { createXhr }).create(body)
    expect(result).toEqual(ticket)
    expect([calls[0].method, calls[0].url.pathname, calls[0].body]).toEqual(['POST', '/v1/uploads', body])
  })

  it('PUTs the file straight to the signed URL with the ticket headers and no bearer token', async () => {
    FakeXhr.instances = []
    FakeXhr.script = (xhr) => {
      xhr.progress(1, 4)
      xhr.progress(4, 4)
      xhr.finish(200)
    }
    const { client } = fakeApi()
    const progress = vi.fn()
    await createHttpUploadService(client, { createXhr }).put(ticket, file, progress)
    const xhr = FakeXhr.instances[0]
    expect([xhr.method, xhr.url]).toEqual(['PUT', ticket.upload_url])
    expect(xhr.headers['content-type']).toBe(ticket.headers?.['content-type'])
    expect(xhr.headers).not.toHaveProperty('authorization')
    expect(xhr.sent).toBe(file)
    expect(progress.mock.calls.map(([f]) => f)).toEqual([0.25, 1, 1])
  })

  it('works without a progress callback', async () => {
    FakeXhr.script = (xhr) => xhr.finish(200)
    const { client } = fakeApi()
    await expect(createHttpUploadService(client, { createXhr }).put(ticket, file)).resolves.toBeUndefined()
  })

  it('rejects with upload_failed and the HTTP status when storage refuses the file', async () => {
    FakeXhr.script = (xhr) => xhr.finish(403)
    const { client } = fakeApi()
    const failure = await fails(createHttpUploadService(client, { createXhr }).put(ticket, file))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure.problem).toMatchObject({ status: 403, code: 'upload_failed', message_key: 'errors.uploadFailed' })
  })

  it.each(['onerror', 'ontimeout', 'onabort'] as const)('rejects with status 0 on %s', async (event) => {
    FakeXhr.script = (xhr) => xhr[event]?.()
    const { client } = fakeApi()
    const failure = await fails(createHttpUploadService(client, { createXhr }).put(ticket, file))
    expect(failure.problem).toMatchObject({ status: 0, code: 'upload_failed', message_key: 'errors.uploadFailed' })
  })

  it('completes with a deterministic idempotency key per upload', async () => {
    const { client, calls } = fakeApi(json(entryFlow.upload_completed, { status: 202 }))
    const result = await createHttpUploadService(client, { createXhr }).complete('up-1')
    expect(result).toEqual(entryFlow.upload_completed)
    expect([calls[0].method, calls[0].url.pathname]).toEqual(['POST', '/v1/uploads/up-1/complete'])
    expect(calls[0].headers.get('idempotency-key')).toBe('complete-up-1')
  })

  // The template download is covered in template.test.ts (it needs the assembled services and a token).
})

describe('jobs', () => {
  it('reads and cancels a job', async () => {
    const running = entryFlow.jobs.digest_running
    const { client, calls } = fakeApi(json(running), json(entryFlow.jobs.digest_cancelled))
    const jobs = createHttpJobService(client)
    expect((await jobs.get(running.id)).stage).toBe('identifying_columns')
    expect((await jobs.cancel(running.id)).status).toBe('cancelled')
    expect(calls.map((c) => [c.method, c.url.pathname])).toEqual([
      ['GET', `/v1/jobs/${running.id}`],
      ['POST', `/v1/jobs/${running.id}/cancel`],
    ])
  })

  it('surfaces a conflict when the job can no longer be cancelled', async () => {
    const { client } = fakeApi(problem(409, { ...errorsFx.failure, status: 409, code: 'conflict', message_key: 'errors.conflict' }))
    expect((await fails(createHttpJobService(client).cancel('j'))).problem.status).toBe(409)
  })
})

describe('createHttpServices', () => {
  function auth(token: string | null): AuthClient {
    return {
      auth: {
        getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ error: null }),
        signOut: async () => ({ error: null }),
      },
    }
  }

  it('builds every port and sends the Supabase access token to the API', async () => {
    const calls: Call[] = []
    const services = createHttpServices({
      apiUrl: 'https://api.example.test',
      supabase: auth('session-token'),
      createXhr,
      fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: new URL(String(input)), method: init.method ?? 'GET', headers: new Headers(init.headers), body: undefined })
        return json(sessionFx.user)
      }) as typeof fetch,
    })
    expect(Object.keys(services).sort()).toEqual(['auth', 'chat', 'conversations', 'jobs', 'profile', 'runs', 'uploads'])
    await services.profile.getMe()
    expect(calls[0].headers.get('authorization')).toBe('Bearer session-token')
    expect(calls[0].url.origin).toBe('https://api.example.test')
  })

  it('calls onUnauthorized when the API answers 401', async () => {
    const onUnauthorized = vi.fn()
    const services = createHttpServices({
      apiUrl: 'https://api.example.test',
      supabase: auth('expired'),
      onUnauthorized,
      createXhr,
      fetch: (async () => problem(401, { ...errorsFx.failure, status: 401, code: 'unauthorized', message_key: 'errors.unauthorized' })) as typeof fetch,
    })
    await expect(services.profile.getMe()).rejects.toBeInstanceOf(ApiFailure)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not build the run and chat services until they are used', () => {
    const runs = vi.fn(() => ({}) as never)
    const chat = vi.fn(() => ({}) as never)
    const services = createHttpServices({ apiUrl: 'https://api.example.test', supabase: auth(null), createXhr, overrides: { runs, chat } })
    expect(runs).not.toHaveBeenCalled()
    void services.runs
    void services.runs
    void services.chat
    expect(runs).toHaveBeenCalledTimes(1)
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('accepts the real Supabase client (compile-time check)', () => {
    const accepted: AuthClient | null = supabase
    expect(accepted === null || typeof accepted.auth.getSession === 'function').toBe(true)
  })
})
