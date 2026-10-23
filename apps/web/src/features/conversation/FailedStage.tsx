import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServices } from '../../services/servicesContext'
import type { ConversationDetail } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { TextLink } from '../../ui/atoms/TextLink'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { ErrorState } from '../../ui/molecules/ErrorState'
import { ClarificationFlow } from './ClarificationFlow'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { PlanLoader } from './PlanLoader'
import { isNotFound, useJobQuery, usePlanQuery, useRememberedAnswers } from './useConversationData'
import { useRefreshConversation } from './useRefreshConversation'

/** Frame 08d. A failed conversation without a plan failed while reading the file; with one, while calculating. */
export function FailedStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const refresh = useRefreshConversation(conversation.id)
  const remembered = useRememberedAnswers(conversation.id)
  const plan = usePlanQuery(conversation.id, true)
  const job = useJobQuery(conversation.id, conversation.current_job_id)
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)

  const retry = useMutation({
    mutationFn: () => {
      const previous = remembered.get()
      return conversations.startForecast(conversation.id, previous ? { answers: previous, skip: false } : { skip: true })
    },
    onSuccess: refresh,
    onError: () => setFailed(true),
  })
  const onRetry = () => {
    // Known earlier choice (answers, or an explicit skip): repeat it. Unknown (page reloaded): ask again.
    if (remembered.get() === undefined) return setAsking(true)
    setFailed(false)
    retry.mutate()
  }

  const support = <TextLink href={t('conversation.errors.supportHref')}>{t('conversation.failed.support')}</TextLink>
  const ref = job.data?.error_ref

  const card = isNotFound(plan.error) ? (
    <ErrorState
      title={t('conversation.failed.digestTitle')}
      body={t('conversation.failed.digestBody')}
      supportReference={ref ? t('conversation.failed.reference', { ref }) : undefined}
      primaryAction={<TextLink href="/nuevo">{t('conversation.uploadAnother')}</TextLink>}
      secondaryAction={support}
    />
  ) : (
    <PlanLoader query={plan}>
      {(view) => (
        <div className="flex flex-col gap-4">
          <ErrorState
            title={t('conversation.failed.title')}
            body={t('conversation.failed.body')}
            supportReference={ref ? t('conversation.failed.reference', { ref }) : undefined}
            primaryAction={
              <Button onClick={onRetry} loading={retry.isPending}>
                {t('conversation.failed.retry')}
              </Button>
            }
            secondaryAction={support}
          />
          {failed && <InlineNotice tone="warning">{t('conversation.clarification.startError')}</InlineNotice>}
          {asking && <ClarificationFlow conversation={conversation} plan={view} />}
        </div>
      )}
    </PlanLoader>
  )

  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedStopped')}
      messages={[assistantMessage('failed', t('conversation.thread.assistant'), asking ? t('conversation.failed.retryQuestionsAssistant') : undefined, card)]}
    />
  )
}
