import { useTranslation } from 'react-i18next'
import type { Job } from '../../services/types'
import { JobProgress } from '../../ui/organisms/JobProgress'

interface Props {
  job: Job
  label: string
  onCancel?: () => void
  cancelLabel?: string
}

/** Renders exactly the stages of the running job; nothing is invented client-side. */
export function JobSteps({ job, label, onCancel, cancelLabel }: Props) {
  const { t } = useTranslation()
  const steps = job.stages.map((s) => ({
    id: s.stage,
    label: s.stage === 'ready' ? t(job.kind === 'digest' ? 'conversation.stages.digestReady' : 'conversation.stages.forecastReady') : t(`conversation.stages.${s.stage}`),
  }))
  const active = job.stages.findIndex((s) => s.state === 'active')
  const allDone = job.stages.length > 0 && job.stages.every((s) => s.state === 'done')
  // Queued jobs have no active stage yet: -1 renders every step as pending.
  const activeIndex = allDone ? steps.length : active
  return (
    <JobProgress
      label={label}
      steps={steps}
      activeIndex={activeIndex}
      statusLabels={{ done: t('conversation.stageStatus.done'), active: t('conversation.stageStatus.active'), pending: t('conversation.stageStatus.pending') }}
      cancelLabel={cancelLabel}
      onCancel={onCancel}
    />
  )
}
