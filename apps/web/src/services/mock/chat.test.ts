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

  it('stops on abort without a closing message.end and keeps the partial text as interrupted', async () => {
    const services = createMockServices()
    services.chatDelayMs = 1
    const controller = new AbortController()
    const events: ChatStreamEvent[] = []
    for await (const e of services.chat.send(CONVERSATION, { text: 'hola' }, controller.signal)) {
      events.push(e)
      if (e.event === 'text.delta') controller.abort()
    }
    // The real server records the interruption itself and sends no final frame.
    expect(events.some((e) => e.event === 'message.end')).toBe(false)
    const stored = (await services.chat.list(CONVERSATION)).at(-1)!
    expect(stored.status).toBe('interrupted')
    expect(stored.display_text.length).toBeGreaterThan(0)
  })

  it('reports a stream error and stores the failed message', async () => {
    const services = createMockServices()
    services.failChat = true
    const events = await collect(services.chat.send(CONVERSATION, { text: 'hola' }))
    expect(events.at(-1)).toMatchObject({ event: 'error', message_key: 'errors.assistantUnavailable' })
    expect((await services.chat.list(CONVERSATION)).at(-1)?.status).toBe('error')
  })

  it('retries by appending a new assistant message, leaving the failed one in place (like the API)', async () => {
    const { chat } = createMockServices()
    const before = await chat.list(CONVERSATION)
    const failed = before.find((m) => m.status === 'error')!
    const events = await collect(chat.retry(failed.id))
    expect(events.at(-1)?.event).toBe('message.end')
    const after = await chat.list(CONVERSATION)
    expect(after.find((m) => m.id === failed.id)?.status).toBe('error')
    expect(after).toHaveLength(before.length + 1)
    expect(after.at(-1)).toMatchObject({ role: 'assistant', status: 'complete' })
    expect(after.at(-1)?.id).not.toBe(failed.id)
    expect(await chat.feedback(after.at(-1)!.id, 'up')).toEqual({ message_id: after.at(-1)!.id, value: 'up' })
  })
})
