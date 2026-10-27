import { Button } from '../../ui/atoms/Button'
import type { TFunction } from 'i18next'
import type { ChatMessage, FeedbackValue } from '../../services/types'
import type { ChatThreadMessage } from '../../ui/organisms/ChatThread'
import { annotateMarkdown } from './annotate'
import { backendKey, toolKey } from './backendKey'
import { formatBytes } from '../conversation/format'
import type { Draft } from './streamDraft'

export interface ThreadContext {
  conversationId: string
  t: TFunction
  locale: string
  draft: Draft | null
  onCopy: (text: string) => void
  onRetry: (messageId: string) => void
  onRate: (messageId: string, value: FeedbackValue) => void
}

/** Reference line plus the Retry button, shown under an answer that stopped or failed. */
function recovery(ctx: ThreadContext, messageId: string, ref?: string) {
  return (
    <div className="flex flex-col items-start gap-2">
      {ref && <p className="font-mono text-body-sm text-mute">{ctx.t('chat.note.reference', { ref })}</p>}
      <Button variant="secondary" size="sm" onClick={() => ctx.onRetry(messageId)}>
        {ctx.t('chat.note.retry')}
      </Button>
    </div>
  )
}

function fromDraft(draft: Draft, ctx: ThreadContext): ChatThreadMessage {
  const { t } = ctx
  const base: ChatThreadMessage = {
    id: draft.messageId,
    role: 'assistant',
    authorLabel: t('chat.author.assistant'),
    text: annotateMarkdown(draft.text, draft.annotations, ctx.conversationId),
    streaming: draft.phase === 'streaming',
    toolLines: draft.tools.map((tool) => t(toolKey(tool.statusKey))),
  }
  if (draft.phase === 'error' && draft.error) {
    return {
      ...base,
      note: { tone: 'warning', title: t('chat.note.errorTitle'), text: t(backendKey(draft.error.messageKey)) },
      card: recovery(ctx, draft.messageId, draft.error.ref),
    }
  }
  if (draft.phase === 'interrupted') {
    return { ...base, note: { tone: 'info', text: t('chat.note.interrupted') }, card: recovery(ctx, draft.messageId) }
  }
  return base
}

function fromStored(m: ChatMessage, isLast: boolean, ctx: ThreadContext): ChatThreadMessage {
  const { t } = ctx
  if (m.role === 'user') {
    const file = m.payload?.kind === 'file' ? { name: m.payload.file_name, size: formatBytes(m.payload.size_bytes, ctx.locale) } : undefined
    return { id: m.id, role: 'user', authorLabel: t('chat.author.you'), text: m.display_text || undefined, file }
  }

  const base: ChatThreadMessage = {
    id: m.id,
    role: 'assistant',
    authorLabel: t('chat.author.assistant'),
    text: m.display_text ? annotateMarkdown(m.display_text, m.annotations, ctx.conversationId) : undefined,
  }
  if (m.status === 'error') {
    const payload = m.payload?.kind === 'error' ? m.payload : null
    return {
      ...base,
      note: { tone: 'warning', title: t('chat.note.errorTitle'), text: t(backendKey(payload?.message_key ?? '')) },
      // Only the latest answer can be retried (the API answers 409 `errors.retryNotLatest` otherwise).
      card: isLast ? recovery(ctx, m.id, payload?.ref) : undefined,
    }
  }
  if (m.status === 'interrupted') {
    return { ...base, note: { tone: 'info', text: t('chat.note.interrupted') }, card: isLast ? recovery(ctx, m.id) : undefined }
  }
  // Stage messages (progress, mapping, clarification, result) are part of the transcript, not answers to rate.
  if (m.status === 'complete' && (m.payload?.kind ?? 'text') === 'text') {
    return {
      ...base,
      actions: {
        label: t('chat.actions.label'),
        copyLabel: t('chat.actions.copy'),
        retryLabel: t('chat.actions.retry'),
        likeLabel: t('chat.actions.like'),
        dislikeLabel: t('chat.actions.dislike'),
        liked: m.feedback === 'up',
        disliked: m.feedback === 'down',
        onCopy: () => ctx.onCopy(m.display_text),
        onRetry: isLast ? () => ctx.onRetry(m.id) : undefined,
        onLike: () => ctx.onRate(m.id, 'up'),
        onDislike: () => ctx.onRate(m.id, 'down'),
      },
    }
  }
  return base
}

/**
 * Maps the stored transcript plus the live draft into thread messages. The draft is appended as the newest
 * answer (a retry is a new message too); it only replaces a stored message once the refetch returns its id.
 */
export function toThreadMessages(messages: ChatMessage[], ctx: ThreadContext): ChatThreadMessage[] {
  const { draft } = ctx
  const replacesStored = draft !== null && messages.some((m) => m.id === draft.messageId)
  const lastAssistantId = draft && !replacesStored ? draft.messageId : messages.findLast((m) => m.role === 'assistant')?.id

  const items = messages.map((m) =>
    draft && m.id === draft.messageId ? fromDraft(draft, ctx) : fromStored(m, m.id === lastAssistantId, ctx),
  )
  if (draft && !replacesStored) items.push(fromDraft(draft, ctx))
  return items
}
