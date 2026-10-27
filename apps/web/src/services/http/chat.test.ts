import { describe, expect, it, vi } from 'vitest'
import chat from '../mock/fixtures/chat.json'
import { ApiFailure, type ChatMessage, type ChatStreamEvent } from '../types'
import { createHttpClient } from './client'
import { createHttpChatService } from './chat'

const CONVERSATION = 'c5d30c23-398a-5d64-a690-c2086b0def35'
const enc = new TextEncoder()
const example = chat.stream_example as unknown as ChatStreamEvent[]

/** Same wire format as apps/api `services/chat.py::frame`. */
const frame = (event: { event: string }) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const problem = (status: number, code: string, messageKey: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: code, status, code, message_key: messageKey, ref: 'K7Q2WX' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

function sse(chunks: string[], failAfter?: Error): Response {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]))
      else if (failAfter) controller.error(failAfter)
      else controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

function setup(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
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
  return { service: createHttpChatService(client), calls }
}

async function collect(stream: AsyncIterable<ChatStreamEvent>) {
  const out: ChatStreamEvent[] = []
  for await (const event of stream) out.push(event)
  return out
}

const message = (seq: number): ChatMessage => ({
  id: `m${seq}`,
  conversation_id: CONVERSATION,
  role: seq % 2 ? 'user' : 'assistant',
  status: 'complete',
  display_text: `message ${seq}`,
  payload: { kind: 'text' },
  annotations: [],
  context_product_code: null,
  feedback: null,
  created_at: `2026-10-23T09:${String(seq).padStart(2, '0')}:00Z`,
})

describe('http chat service: list', () => {
  it('reads a single page', async () => {
    const items = [message(1), message(2)]
    const { service, calls } = setup(() => json({ items, next_cursor: null }))
    expect(await service.list(CONVERSATION)).toEqual(items)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe(`/v1/conversations/${CONVERSATION}/messages`)
    expect(calls[0].url.searchParams.get('limit')).toBe('100')
    expect(calls[0].url.searchParams.has('cursor')).toBe(false)
  })

  it('walks back through the cursors and returns the transcript oldest first', async () => {
    // The API sends the latest page first (oldest first inside it); next_cursor leads to earlier messages.
    const latest = { items: [message(5), message(6)], next_cursor: 'c-2' }
    const earlier = { items: [message(3), message(4)], next_cursor: 'c-1' }
    const earliest = { items: [message(1), message(2)], next_cursor: null }
    const { service, calls } = setup((url) => {
      const cursor = url.searchParams.get('cursor')
      return json(cursor === 'c-2' ? earlier : cursor === 'c-1' ? earliest : latest)
    })
    const all = await service.list(CONVERSATION)
    expect(all.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    expect(calls.map((c) => c.url.searchParams.get('cursor'))).toEqual([null, 'c-2', 'c-1'])
  })

  it('stops after a sane number of pages even if the cursor never ends', async () => {
    const { service, calls } = setup(() => json({ items: [message(1)], next_cursor: 'again' }))
    const all = await service.list(CONVERSATION)
    expect(calls.length).toBeLessThanOrEqual(20)
    expect(all.length).toBe(calls.length)
  })

  it('rejects with the API problem for an unknown conversation', async () => {
    const { service } = setup(() => problem(404, 'not_found', 'errors.notFound'))
    await expect(service.list(CONVERSATION)).rejects.toMatchObject({ problem: { status: 404 } })
  })

  it('parses the seeded transcript fixture unchanged', async () => {
    const seeded = (chat.messages as unknown as ChatMessage[]).filter((m) => m.conversation_id === CONVERSATION)
    const { service } = setup(() => json({ items: seeded, next_cursor: null }))
    expect(await service.list(CONVERSATION)).toEqual(seeded)
  })
})

describe('http chat service: send', () => {
  it('posts the question as an event stream and yields the recorded events unchanged', async () => {
    const { service, calls } = setup(() => sse(example.map(frame)))
    const events = await collect(service.send(CONVERSATION, { text: '¿Qué debo comprar primero?' }))
    expect(events).toEqual(example)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe(`/v1/conversations/${CONVERSATION}/messages`)
    expect(new Headers(calls[0].init.headers).get('accept')).toBe('text/event-stream')
    expect(calls[0].body).toEqual({ text: '¿Qué debo comprar primero?' })
  })

  it('forwards the product the question is about', async () => {
    const { service, calls } = setup(() => sse([]))
    await collect(service.send(CONVERSATION, { text: 'hola', context_product_code: 'QF-0001' }))
    expect(calls[0].body).toEqual({ text: 'hola', context_product_code: 'QF-0001' })
  })

  it('rebuilds frames that arrive split in arbitrary chunks', async () => {
    const wire = example.map(frame).join('')
    const chunks = wire.match(/[\s\S]{1,7}/g) ?? []
    const { service } = setup(() => sse(chunks))
    expect(await collect(service.send(CONVERSATION, { text: 'x' }))).toEqual(example)
  })

  it('ignores heartbeats, unknown events and frames that are not valid JSON', async () => {
    const wire = [
      ': keep-alive\n\n',
      'event: something.new\ndata: {"event":"something.new"}\n\n',
      'event: text.delta\ndata: {not json\n\n',
      frame({ event: 'message.start', message_id: 'a1' } as ChatStreamEvent),
    ].join('')
    const { service } = setup(() => sse([wire]))
    expect(await collect(service.send(CONVERSATION, { text: 'x' }))).toEqual([{ event: 'message.start', message_id: 'a1' }])
  })

  it('passes a server-side error event through as the last event', async () => {
    const error = { event: 'error', message_key: 'errors.assistant', ref: 'K7Q2WX' } as ChatStreamEvent
    const { service } = setup(() => sse([frame(example[0]), frame(error)]))
    const events = await collect(service.send(CONVERSATION, { text: 'x' }))
    expect(events.at(-1)).toEqual(error)
  })

  it.each([
    [503, 'assistant_unavailable', 'errors.assistantUnavailable'],
    [429, 'rate_limited', 'errors.rateLimited'],
    [404, 'not_found', 'errors.notFound'],
  ])('rejects with ApiFailure %i before the stream starts', async (status, code, key) => {
    const { service } = setup(() => problem(status, code, key))
    const error = await collect(service.send(CONVERSATION, { text: 'x' })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiFailure)
    expect((error as ApiFailure).problem).toMatchObject({ status, code, message_key: key })
  })

  it('ends with a network error event when the connection drops mid-stream', async () => {
    const { service } = setup(() => sse([frame(example[0]), frame(example[3])], new TypeError('network error')))
    const events = await collect(service.send(CONVERSATION, { text: 'x' }))
    expect(events.slice(0, 2)).toEqual([example[0], example[3]])
    expect(events.at(-1)).toEqual({ event: 'error', message_key: 'errors.network', ref: '' })
    expect(events).toHaveLength(3)
  })

  it('ends quietly, without an error event, when the caller aborts', async () => {
    const controller = new AbortController()
    const { service } = setup((_url, init) => {
      const signal = init.signal as AbortSignal
      let i = 0
      const body = new ReadableStream<Uint8Array>({
        async pull(c) {
          if (signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'))
          await new Promise((r) => setTimeout(r, 1))
          c.enqueue(enc.encode(frame(example[Math.min(i++, example.length - 1)])))
        },
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    })
    const events: ChatStreamEvent[] = []
    for await (const event of service.send(CONVERSATION, { text: 'x' }, controller.signal)) {
      events.push(event)
      if (events.length === 2) controller.abort()
    }
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.some((e) => e.event === 'error')).toBe(false)
  })

  it('does not call the API when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { service, calls } = setup(() => sse(example.map(frame)))
    const events = await collect(service.send(CONVERSATION, { text: 'x' }, controller.signal)).catch(() => [])
    expect(events).toEqual([])
    expect(calls.length === 0 || (calls[0].init.signal as AbortSignal).aborted).toBe(true)
  })
})

describe('http chat service: retry and feedback', () => {
  it('retries as an event stream under /v1/messages', async () => {
    const { service, calls } = setup(() => sse(example.map(frame)))
    expect(await collect(service.retry('m6'))).toEqual(example)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url.pathname).toBe('/v1/messages/m6/retry')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('rejects when the answer is not the latest one', async () => {
    const { service } = setup(() => problem(409, 'conflict', 'errors.retryNotLatest'))
    await expect(collect(service.retry('m2'))).rejects.toMatchObject({ problem: { status: 409, message_key: 'errors.retryNotLatest' } })
  })

  it('posts a like, a dislike and a cleared vote', async () => {
    const { service, calls } = setup((_url, init) => json({ message_id: 'm6', value: JSON.parse(String(init.body)).value }))
    expect(await service.feedback('m6', 'up')).toEqual({ message_id: 'm6', value: 'up' })
    expect(await service.feedback('m6', 'down')).toEqual({ message_id: 'm6', value: 'down' })
    expect(await service.feedback('m6', null)).toEqual({ message_id: 'm6', value: null })
    expect(calls.map((c) => c.body)).toEqual([{ value: 'up' }, { value: 'down' }, { value: null }])
    expect(calls[0].url.pathname).toBe('/v1/messages/m6/feedback')
    expect(calls[0].init.method).toBe('POST')
  })

  it('rejects feedback for an unknown message', async () => {
    const { service } = setup(() => problem(404, 'not_found', 'errors.notFound'))
    await expect(service.feedback('nope', 'up')).rejects.toBeInstanceOf(ApiFailure)
  })
})
