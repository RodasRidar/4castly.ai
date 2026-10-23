import { useTranslation } from 'react-i18next'
import type { ConversationDetail } from '../../services/types'
import { ProgressCount } from '../../ui/molecules/ProgressCount'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { JobSteps } from './JobSteps'
import { useJobQuery } from './useConversationData'

/** Frame 05-calculando. Indeterminate bar plus the backend's own "processed of total" count, never a percentage. */
export function CalculatingStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const job = useJobQuery(conversation.id, conversation.current_job_id)
  const { processed, total } = job.data ?? {}
  const card = (
    <div className="flex w-full max-w-md flex-col gap-4">
      {job.data && <JobSteps job={job.data} label={t('conversation.calculating.stepperLabel')} />}
      <ProgressCount
        label={t('conversation.calculating.progressLabel')}
        countText={processed != null && total != null ? t('conversation.calculating.count', { processed, total }) : undefined}
      />
    </div>
  )
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedCalculating')}
      messages={[assistantMessage('calculating', t('conversation.thread.assistant'), t('conversation.calculating.assistant'), card)]}
    />
  )
}
