import type { ChatMessage, ChatStreamEvent } from '../../services/types'

type Annotation = NonNullable<ChatMessage['annotations']>[number]

export interface Draft {
  /** Starts as the id we expect and follows `message.start` once the server names the message. */
  messageId: string
  text: string
  /** Tools the agent is running right now (`tool.start` seen, `tool.end` not yet). */
  tools: { id: string; statusKey: string }[]
  annotations: Annotation[]
  phase: 'streaming' | 'done' | 'interrupted' | 'error'
  error: { messageKey: string; ref: string } | null
}

export function startDraft(messageId: string): Draft {
  return { messageId, text: '', tools: [], annotations: [], phase: 'streaming', error: null }
}

/** Pure reducer over the SSE events of one assistant answer. Late events after a terminal one are ignored. */
export function applyStreamEvent(draft: Draft, event: ChatStreamEvent): Draft {
  if (draft.phase !== 'streaming') return draft
  switch (event.event) {
    case 'message.start':
      return { ...draft, messageId: event.message_id }
    case 'text.delta':
      return { ...draft, text: draft.text + event.text }
    case 'tool.start':
      return { ...draft, tools: [...draft.tools, { id: event.tool_call_id, statusKey: event.status_key }] }
    case 'tool.end':
      return { ...draft, tools: draft.tools.filter((t) => t.id !== event.tool_call_id) }
    case 'annotation':
      return { ...draft, annotations: [...draft.annotations, event.annotation] }
    case 'message.end':
      return {
        ...draft,
        tools: [],
        phase: event.stop_reason === 'cancelled' || event.stop_reason === 'max_tokens' ? 'interrupted' : 'done',
      }
    case 'error':
      return { ...draft, tools: [], phase: 'error', error: { messageKey: event.message_key, ref: event.ref } }
    default:
      return draft
  }
}
