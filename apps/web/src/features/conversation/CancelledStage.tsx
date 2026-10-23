import { useTranslation } from 'react-i18next'
import type { ConversationDetail } from '../../services/types'
import { TextLink } from '../../ui/atoms/TextLink'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { StopNotice } from './StopNotice'

export function CancelledStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const card = (
    <StopNotice
      title={t('conversation.cancelled.title')}
      body={t('conversation.cancelled.body')}
      action={<TextLink href="/nuevo">{t('conversation.uploadAnother')}</TextLink>}
    />
  )
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedStopped')}
      messages={[assistantMessage('cancelled', t('conversation.thread.assistant'), undefined, card)]}
    />
  )
}
