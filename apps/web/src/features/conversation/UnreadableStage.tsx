import { useTranslation } from 'react-i18next'
import type { ConversationDetail, UploadErrorCode } from '../../services/types'
import { TextLink } from '../../ui/atoms/TextLink'
import { ErrorState } from '../../ui/molecules/ErrorState'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'

const COPY: Record<UploadErrorCode, string> = {
  password_protected: 'password',
  corrupt: 'corrupt',
  unsupported_format: 'unsupported',
  empty: 'empty',
  too_large: 'tooLarge',
}

/** Frame 08a. The copy follows the upload's error code; a missing code falls back to a generic message. */
export function UnreadableStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const code = conversation.upload?.error_code
  const key = code ? COPY[code] : 'generic'
  const card = (
    <ErrorState
      title={t(`conversation.unreadable.${key}Title`)}
      body={t(`conversation.unreadable.${key}Body`)}
      primaryAction={<TextLink href="/nuevo">{t('conversation.uploadAnother')}</TextLink>}
    />
  )
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedStopped')}
      messages={[assistantMessage('unreadable', t('conversation.thread.assistant'), undefined, card)]}
    />
  )
}
