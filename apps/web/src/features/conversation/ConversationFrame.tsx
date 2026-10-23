import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConversationDetail } from '../../services/types'
import { SuggestionChips } from '../../ui/molecules/SuggestionChips'
import { ChatThread, type ChatThreadMessage } from '../../ui/organisms/ChatThread'
import { Composer } from '../../ui/organisms/Composer'
import { formatBytes } from './format'

interface FrameProps {
  conversation: ConversationDetail
  /** Messages after the user's file bubble, in order. */
  messages: ChatThreadMessage[]
  /** `null` unlocks the composer (the stage allows questions). */
  lockedReason: string | null
  suggestions?: boolean
}

/** Thread + composer shared by every stage. Chat sending itself belongs to F5; here the draft is local. */
export function ConversationFrame({ conversation, messages, lockedReason, suggestions = false }: FrameProps) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  const locked = lockedReason !== null

  const fileMessage: ChatThreadMessage | null = conversation.file_name
    ? {
        id: 'file',
        role: 'user',
        authorLabel: t('conversation.thread.you'),
        file: {
          name: conversation.file_name,
          size: conversation.upload ? formatBytes(conversation.upload.size_bytes, i18n.language) : undefined,
        },
      }
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatThread
        className="min-h-0 flex-1"
        label={t('conversation.thread.label')}
        jumpLabel={t('conversation.thread.jump')}
        messages={fileMessage ? [fileMessage, ...messages] : messages}
        loadingLabel={t('common.loading')}
        emptyTitle={t('conversation.thread.emptyTitle')}
        emptyBody={t('conversation.thread.emptyBody')}
        errorTitle={t('conversation.thread.errorTitle')}
        errorBody={t('conversation.thread.errorBody')}
        retryLabel={t('common.retry')}
      />
      <div className="flex flex-col gap-3 border-t border-hairline p-4">
        {suggestions && (
          <SuggestionChips
            label={t('conversation.suggestions.label')}
            suggestions={[t('conversation.suggestions.first'), t('conversation.suggestions.second'), t('conversation.suggestions.third')]}
            locked={locked}
            onSelect={setDraft}
          />
        )}
        <Composer
          label={t('conversation.composer.label')}
          placeholder={t('conversation.composer.placeholder')}
          value={draft}
          onChange={setDraft}
          // Answering belongs to the chat (F5); until then sending only clears the draft.
          onSend={() => setDraft('')}
          sendLabel={t('conversation.composer.send')}
          stopLabel={t('conversation.composer.stop')}
          locked={locked}
          lockedReason={lockedReason ?? undefined}
          hint={{ send: t('conversation.composer.hintSend'), newline: t('conversation.composer.hintNewline') }}
        />
      </div>
    </div>
  )
}
