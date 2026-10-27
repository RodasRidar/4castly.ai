import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProviders } from '../../app/providers'
import type { AppEnv } from '../../app/env'
import { NotificationsProvider } from '../../app/notifications'
import { createI18n } from '../../i18n'
import { createMockServices } from '../../services/mock'
import type { ChatMessage, ChatStreamEvent, Locale } from '../../services/types'
import { createThemeStore } from '../../theme/themeStore'
import { ChatPanel, type ChatPanelProps } from './ChatPanel'

/** The seeded conversation with a full transcript (file, stages, answer with figures, interrupted, failed). */
export const SEEDED = 'c5d30c23-398a-5d64-a690-c2086b0def35'
/** A conversation that has no chat messages in the fixtures. */
export const EMPTY = 'f9f0fc05-4411-53c2-8a70-6dfb1d902c1b'

interface RenderPanelOptions extends Partial<ChatPanelProps> {
  language?: Locale
  /** Replaces `chat.list` before the first render. */
  list?: () => Promise<ChatMessage[]>
}

/** Mounts only `<ChatPanel>` inside the real providers, with mock services and a private theme store. */
export function renderPanel({ language = 'es', conversationId = SEEDED, list, ...props }: RenderPanelOptions = {}) {
  const services = createMockServices()
  if (list) services.chat.list = list
  const root = document.createElement('html')
  const store = new Map<string, string>()
  const themeStore = createThemeStore({
    root,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    matchMedia: window.matchMedia.bind(window),
  })
  const env: AppEnv = { services, i18n: createI18n(language), themeStore, root }
  const user = userEvent.setup()
  const result = render(
    <AppProviders env={env}>
      <NotificationsProvider>
        <div style={{ height: 600, display: 'flex', flexDirection: 'column' }}>
          <ChatPanel conversationId={conversationId} {...props} />
        </div>
      </NotificationsProvider>
    </AppProviders>,
  )
  return { ...result, services, user }
}

/**
 * A stream the test drives by hand, so tool lines, token-by-token text, Stop and errors can be asserted at
 * exact moments. Aborting the request just ends the stream, like the real server (it records the interruption
 * itself and sends no closing `message.end`).
 */
export function controlledStream(signal?: AbortSignal) {
  const queue: ChatStreamEvent[] = []
  let wake: (() => void) | null = null
  let closed = false

  const push = (event: ChatStreamEvent) => {
    queue.push(event)
    wake?.()
  }
  const close = () => {
    closed = true
    wake?.()
  }
  signal?.addEventListener('abort', close)

  async function* iterate(): AsyncGenerator<ChatStreamEvent> {
    for (;;) {
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }
      if (closed) return
      await new Promise<void>((resolve) => (wake = resolve))
    }
  }
  return { push, close, stream: iterate() }
}

export const end = (stopReason: 'end_turn' | 'cancelled' = 'end_turn'): ChatStreamEvent => ({
  event: 'message.end',
  message_id: 'm-ctl',
  stop_reason: stopReason,
  usage: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0 },
})
export const delta = (text: string): ChatStreamEvent => ({ event: 'text.delta', message_id: 'm-ctl', text })
export const start: ChatStreamEvent = { event: 'message.start', message_id: 'm-ctl' }
