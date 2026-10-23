import type { ConversationDetail } from '../../services/types'
import { CalculatingStage } from './CalculatingStage'
import { CancelledStage } from './CancelledStage'
import { ClarificationStage } from './ClarificationStage'
import { ConfirmationStage } from './ConfirmationStage'
import { DateColumnStage } from './DateColumnStage'
import { DigestStage } from './DigestStage'
import { FailedStage } from './FailedStage'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../../ui/atoms/Spinner'
import { UnreadableStage } from './UnreadableStage'

/** The only place that maps the backend's stage to a screen (plan 2.1). It never infers a stage itself. */
export function ConversationStage({ conversation }: { conversation: ConversationDetail }) {
  switch (conversation.stage) {
    case 'queued':
    case 'uploaded':
    case 'digesting':
      return <DigestStage conversation={conversation} />
    case 'unreadable':
      return <UnreadableStage conversation={conversation} />
    case 'needs_date_column':
      return <DateColumnStage conversation={conversation} />
    case 'awaiting_confirmation':
      return <ConfirmationStage conversation={conversation} />
    case 'confirmed':
    case 'clarifying':
      return <ClarificationStage conversation={conversation} />
    case 'calculating':
      return <CalculatingStage conversation={conversation} />
    case 'failed':
      return <FailedStage conversation={conversation} />
    case 'cancelled':
      return <CancelledStage conversation={conversation} />
    case 'ready':
      return (
        <Suspense fallback={<LoadingResults />}>
          <ResultsStage conversation={conversation} />
        </Suspense>
      )
  }
}

// Charts and markdown are heavy and only the `ready` stage needs them.
const ResultsStage = lazy(() => import('./ResultsStage').then((m) => ({ default: m.ResultsStage })))

function LoadingResults() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  )
}
