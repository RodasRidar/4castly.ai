import type { ChatService } from '../ports'
import type { ChatMessage, ChatStreamEvent, Feedback, FeedbackValue, MessageCreate } from '../types'
import type { HttpClient } from './client'
import { parseSse, type SseFrame } from './sse'

const PAGE_SIZE = 100
/** A long conversation is cut here instead of looping on a cursor that never ends (about 2 000 messages). */
const MAX_PAGES = 20

const KNOWN_EVENTS = new Set<string>(['message.start', 'text.delta', 'tool.start', 'tool.end', 'annotation', 'message.end', 'error'])

interface MessagePage {
  items: ChatMessage[]
  next_cursor: string | null
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/** The JSON already carries `event`; frames that are unknown or not valid JSON are skipped, never fatal. */
function toEvent(frame: SseFrame): ChatStreamEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(frame.data)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const name = (parsed as { event?: unknown }).event ?? frame.event
  return typeof name === 'string' && KNOWN_EVENTS.has(name) ? ({ ...parsed, event: name } as ChatStreamEvent) : null
}

/**
 * Opens the stream and yields its events. Problems before the first byte reject (the client turns them into
 * `ApiFailure`); a connection that drops afterwards ends with a synthetic `errors.network` event; aborting ends
 * the iteration quietly, because the UI treats that as "Stop" (the server stores the partial answer itself).
 */
async function* events(open: () => Promise<Response>, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
  if (signal?.aborted) return
  let response: Response
  try {
    response = await open()
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return
    throw error
  }
  if (!response.body) return
  try {
    for await (const frame of parseSse(response.body, signal)) {
      const event = toEvent(frame)
      if (event) yield event
    }
  } catch {
    if (!signal?.aborted) yield { event: 'error', message_key: 'errors.network', ref: '' }
  }
}

export function createHttpChatService(client: HttpClient): ChatService {
  return {
    async list(conversationId) {
      // The API returns the latest page first (oldest first inside it) and the cursor walks back in time.
      const pages: ChatMessage[][] = []
      let cursor: string | null = null
      for (let i = 0; i < MAX_PAGES; i++) {
        const page: MessagePage = await client.json<MessagePage>('GET', `/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
          query: { limit: PAGE_SIZE, cursor },
        })
        pages.push(page.items)
        cursor = page.next_cursor
        if (!cursor) break
      }
      return pages.reverse().flat()
    },

    send: (conversationId, message: MessageCreate, signal) =>
      events(
        () =>
          client.stream('POST', `/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
            body: message,
            signal,
          }),
        signal,
      ),

    retry: (messageId, signal) =>
      events(() => client.stream('POST', `/v1/messages/${encodeURIComponent(messageId)}/retry`, { signal }), signal),

    feedback: (messageId, value: FeedbackValue | null) =>
      client.json<Feedback>('POST', `/v1/messages/${encodeURIComponent(messageId)}/feedback`, { body: { value } }),
  }
}
