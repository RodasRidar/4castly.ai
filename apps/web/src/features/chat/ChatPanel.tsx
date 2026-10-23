import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { cn } from '../../lib/cn'
import { VisuallyHidden } from '../../ui/atoms/VisuallyHidden'
import { SuggestionChips } from '../../ui/molecules/SuggestionChips'
import { ChatThread } from '../../ui/organisms/ChatThread'
import { Composer } from '../../ui/organisms/Composer'
import { toThreadMessages } from './toThreadMessages'
import { useChat } from './useChat'

export interface ChatPanelProps {
  conversationId: string
  /** Scopes the assistant to one product (product detail drawer). */
  productCode?: string
  /** Suggested questions shown above the composer; clicking one asks it. */
  suggestions?: string[]
  className?: string
}

/**
 * Streaming assistant chat for one conversation. Fills its container: the thread scrolls and the composer is
 * pinned at the bottom. It never locks itself: the caller mounts it only when the stage allows questions.
 */
export function ChatPanel({ conversationId, productCode, suggestions, className }: ChatPanelProps) {
  const { t, i18n } = useTranslation()
  const notify = useNotify()
  const chat = useChat(conversationId, productCode)
  const [draftText, setDraftText] = useState('')

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        notify('success', t('chat.copied'))
      } catch {
        notify('error', t('chat.copyFailed'))
      }
    },
    [notify, t],
  )

  const { messages, draft, retry, rate } = chat
  const thread = useMemo(
    () =>
      toThreadMessages(messages, {
        conversationId,
        t,
        locale: i18n.language,
        draft,
        onCopy: (text) => void copy(text),
        onRetry: (id) => void retry(id),
        onRate: rate,
      }),
    [messages, draft, conversationId, i18n.language, t, copy, retry, rate],
  )

  const send = (text: string) => {
    setDraftText('')
    void chat.send(text)
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <ChatThread
        label={t('chat.thread.label')}
        jumpLabel={t('chat.thread.jump')}
        messages={thread}
        state={chat.status}
        loadingLabel={t('chat.thread.loading')}
        emptyTitle={t('chat.thread.emptyTitle')}
        emptyBody={t('chat.thread.emptyBody')}
        errorTitle={t('chat.thread.errorTitle')}
        errorBody={t('chat.thread.errorBody')}
        retryLabel={t('chat.note.retry')}
        onRetry={chat.reload}
      />
      {/* One polite announcement at the start and one at the end; individual tokens are never announced. */}
      <VisuallyHidden role="status" aria-live="polite">
        {chat.announcement && t(`chat.status.${chat.announcement}`)}
      </VisuallyHidden>
      <div className="flex flex-col gap-3 border-t border-hairline p-4">
        {suggestions && suggestions.length > 0 && !chat.generating && (
          <SuggestionChips label={t('chat.suggestions.label')} suggestions={suggestions} onSelect={send} />
        )}
        <Composer
          label={t('chat.composer.label')}
          placeholder={t('chat.composer.placeholder')}
          value={draftText}
          onChange={setDraftText}
          onSend={send}
          onStop={chat.stop}
          sendLabel={t('chat.composer.send')}
          stopLabel={t('chat.composer.stop')}
          generating={chat.streaming}
          hint={{ send: t('chat.composer.hintSend'), newline: t('chat.composer.hintNewline') }}
        />
      </div>
    </div>
  )
}
