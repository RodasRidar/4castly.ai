import chat from './fixtures/chat.json'
import { failure } from './errors'
import type { ChatService } from '../ports'
import type { ChatMessage, ChatStreamEvent, FeedbackValue } from '../types'

const clone = <T,>(value: T): T => structuredClone(value)
const uuid = () => crypto.randomUUID()
const tick = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve())

export interface ChatMockHooks {
  controls: { failChat: boolean; chatDelayMs: number }
}

/**
 * In-memory chat. `send` replays the recorded stream example event by event, so token rendering, tool status
 * lines, Stop (abort) and errors can all be exercised without a server.
 */
export function createChatService({ controls }: ChatMockHooks): ChatService {
  const messages = new Map<string, ChatMessage[]>()
  for (const m of chat.messages as unknown as ChatMessage[]) {
    messages.set(m.conversation_id, [...(messages.get(m.conversation_id) ?? []), clone(m)])
  }
  const feedback = new Map<string, FeedbackValue | null>()
  const example = chat.stream_example as unknown as ChatStreamEvent[]

  async function* stream(conversationId: string, assistantId: string, signal?: AbortSignal): AsyncIterable<ChatStreamEvent> {
    const events = example.map((e) => ('message_id' in e ? { ...e, message_id: assistantId } : e)) as ChatStreamEvent[]
    let text = ''
    for (const event of events) {
      if (signal?.aborted) break
      await tick(controls.chatDelayMs)
      if (signal?.aborted) break
      if (controls.failChat && event.event === 'text.delta') {
        yield { event: 'error', message_key: 'errors.assistant', ref: 'K7Q2WX' } as ChatStreamEvent
        save(conversationId, { id: assistantId, text, status: 'error' })
        return
      }
      if (event.event === 'text.delta') text += event.text
      if (event.event === 'message.end') {
        save(conversationId, { id: assistantId, text, status: 'complete' })
      }
      yield event
    }
    if (signal?.aborted) {
      save(conversationId, { id: assistantId, text, status: 'interrupted' })
      yield {
        event: 'message.end',
        message_id: assistantId,
        stop_reason: 'cancelled',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
      } as ChatStreamEvent
    }
  }

  function save(conversationId: string, m: { id: string; text: string; status: ChatMessage['status'] }) {
    const list = messages.get(conversationId) ?? []
    const next: ChatMessage = {
      id: m.id,
      conversation_id: conversationId,
      role: 'assistant',
      status: m.status,
      display_text: m.text,
      payload: m.status === 'error' ? { kind: 'error', message_key: 'errors.assistant', ref: 'K7Q2WX' } : { kind: 'text' },
      annotations: [],
      context_product_code: null,
      feedback: null,
      created_at: new Date().toISOString(),
    }
    messages.set(conversationId, [...list.filter((x) => x.id !== m.id), next])
  }

  return {
    async list(conversationId) {
      return clone(messages.get(conversationId) ?? [])
    },
    async *send(conversationId, message, signal) {
      const user: ChatMessage = {
        id: uuid(),
        conversation_id: conversationId,
        role: 'user',
        status: 'complete',
        display_text: message.text,
        payload: { kind: 'text' },
        annotations: [],
        context_product_code: message.context_product_code ?? null,
        feedback: null,
        created_at: new Date().toISOString(),
      }
      messages.set(conversationId, [...(messages.get(conversationId) ?? []), user])
      yield* stream(conversationId, uuid(), signal)
    },
    async *retry(messageId, signal) {
      const owner = [...messages.entries()].find(([, list]) => list.some((m) => m.id === messageId))
      if (!owner) throw failure('not_found')
      yield* stream(owner[0], messageId, signal)
    },
    async feedback(messageId, value) {
      feedback.set(messageId, value)
      return { message_id: messageId, value }
    },
  }
}
