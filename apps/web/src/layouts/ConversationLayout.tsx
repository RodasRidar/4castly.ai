import { Outlet, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { NotFoundPage } from '../features/errors/NotFoundPage'
import type { ConversationOutlet } from '../features/conversation/conversationContext'
import { isNotFound, useConversationQuery } from '../features/conversation/useConversationData'
import { Button } from '../ui/atoms/Button'
import { Spinner } from '../ui/atoms/Spinner'
import { ErrorState } from '../ui/molecules/ErrorState'

/**
 * Frame for /c/:conversationId. Loads the conversation once, handles loading / not found / error, and hands the
 * conversation to the child routes. F5 adds the chat + results split here.
 */
export function ConversationLayout() {
  const { conversationId = '' } = useParams()
  const { t } = useTranslation()
  const query = useConversationQuery(conversationId)

  if (query.data) {
    const context: ConversationOutlet = { conversation: query.data }
    return (
      <div className="flex h-full min-h-0 flex-col" data-conversation-id={conversationId}>
        <Outlet context={context} />
      </div>
    )
  }
  if (isNotFound(query.error)) return <NotFoundPage />
  if (query.isError) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-6">
        <ErrorState
          title={t('conversation.loadErrorTitle')}
          body={t('conversation.loadErrorBody')}
          primaryAction={<Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
        />
      </div>
    )
  }
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6">
      <Spinner label={t('conversation.loading')} />
    </div>
  )
}
