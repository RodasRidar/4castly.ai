import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import type { ConversationDetail } from '../../services/types'
import { JobProgress } from '../../ui/organisms/JobProgress'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { JobSteps } from './JobSteps'
import { useJobQuery } from './useConversationData'
import { useRefreshConversation } from './useRefreshConversation'

/** queued | uploaded | digesting (frame 03). Renders the job's own stages and offers Cancelar. */
export function DigestStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const { jobs } = useServices()
  const notify = useNotify()
  const refresh = useRefreshConversation(conversation.id)
  const jobId = conversation.current_job_id
  const job = useJobQuery(conversation.id, jobId)
  const cancel = useMutation({
    mutationFn: () => jobs.cancel(jobId!),
    onSuccess: refresh,
    onError: () => notify('error', t('conversation.digest.cancelError')),
  })
  const onCancel = () => {
    if (!cancel.isPending) cancel.mutate()
  }

  const progress = job.data ? (
    <JobSteps job={job.data} label={t('conversation.digest.stepperLabel')} cancelLabel={t('conversation.digest.cancel')} onCancel={onCancel} />
  ) : (
    <JobProgress label={t('conversation.digest.stepperLabel')} text={t('conversation.digest.preparing')} />
  )

  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedBeforeConfirm')}
      messages={[assistantMessage('digest', t('conversation.thread.assistant'), t('conversation.digest.assistant'), progress)]}
    />
  )
}
