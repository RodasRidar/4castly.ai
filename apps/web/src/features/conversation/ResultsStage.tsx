import { useTranslation } from 'react-i18next'
import type { ConversationDetail } from '../../services/types'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'

/**
 * Seam for F5: the `ready` stage becomes chat 40 % + results 60 % here. Until then the thread says the
 * forecast is ready and the composer is open.
 */
export function ResultsStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={null}
      messages={[assistantMessage('ready', t('conversation.thread.assistant'), t('conversation.ready.placeholder'))]}
    />
  )
}
