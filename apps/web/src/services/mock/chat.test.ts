import { describe, expect, it } from 'vitest'
import { createMockServices } from '.'
import type { ChatStreamEvent } from '../types'

const CONVERSATION = 'c5d30c23-398a-5d64-a690-c2086b0def35'

async function collect(stream: AsyncIterable<ChatStreamEvent>) {
  const events: ChatStreamEvent[] = []
  for await (const e of stream) events.push(e)
  return events
}

describe('mock chat service', () => {
  it('lists the seeded transcript including the interrupted and failed answers', async () => {
    const { chat } = createMockServices()
    const list = await chat.list(CONVERSATION)
    expect(list.some((m) => m.status === 'interrupted')).toBe(true)
    expect(list.some((m) => m.status === 'error')).toBe(true)
  })

  it('streams start, tool status, text deltas and end, and stores the answer', async () => {
    const { chat } = createMockServices()
    const events = await collect(chat.send(CONVERSATION, { text: '¿Qué debo comprar primero?' }))
    expect(events[0].event).toBe('message.start')
    expect(events.some((e) => e.event === 'tool.start')).toBe(true)
    expect(events.filter((e) => e.event === 'text.delta').length).toBeGreaterThan(1)
    expect(events.at(-1)?.event).toBe('message.end')
    const list = await chat.list(CONVERSATION)
    expect(list.at(-1)).toMatchObject({ role: 'assistant', status: 'complete' })
    expect(list.at(-2)).toMatchObject({ role: 'user', display_text: '¿Qué debo comprar primero?' })
  })

  it('stops on abort with stop_reason cancelled and keeps the partial text as interrupted', async () => {
    const services = createMockServices()
    services.chatDelayMs = 1
    const controller = new AbortController()
    const events: ChatStreamEvent[] = []
    for await (const e of services.chat.send(CONVERSATION, { text: 'hola' }, controller.signal)) {
      events.push(e)
      if (e.event === 'text.delta') controller.abort()
    }
    expect(events.at(-1)).toMatchObject({ event: 'message.end', stop_reason: 'cancelled' })
    expect((await services.chat.list(CONVERSATION)).at(-1)?.status).toBe('interrupted')
  })

  it('reports a stream error and stores the failed message', async () => {
    const services = createMockServices()
    services.failChat = true
    const events = await collect(services.chat.send(CONVERSATION, { text: 'hola' }))
    expect(events.at(-1)).toMatchObject({ event: 'error', message_key: 'errors.assistant' })
    expect((await services.chat.list(CONVERSATION)).at(-1)?.status).toBe('error')
  })

  it('retries an answer in place and records feedback', async () => {
    const { chat } = createMockServices()
    const list = await chat.list(CONVERSATION)
    const failed = list.find((m) => m.status === 'error')!
    const events = await collect(chat.retry(failed.id))
    expect(events.at(-1)?.event).toBe('message.end')
    expect((await chat.list(CONVERSATION)).find((m) => m.id === failed.id)?.status).toBe('complete')
    expect(await chat.feedback(failed.id, 'up')).toEqual({ message_id: failed.id, value: 'up' })
  })
})
