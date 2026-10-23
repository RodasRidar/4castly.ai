import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import type { RunParameters } from '../../services/types'
import { ParametersDrawer, type ParametersValues } from '../../ui/organisms/ParametersDrawer'
import { conversationKey } from '../conversation/useConversationData'
import { runKey, useRunSummary } from './queries'

interface ParametersSectionProps {
  runId: string
  conversationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const toValues = (p: RunParameters): ParametersValues => ({
  horizon: String(p.horizon_weeks),
  granularity: p.granularity,
  leadTime: p.lead_time_days,
  threshold: p.risk_thresholds.critical_margin_weeks,
  style: p.assistant_style,
})

function toParameters(base: RunParameters, v: ParametersValues): RunParameters {
  return {
    ...base,
    horizon_weeks: Number(v.horizon),
    granularity: v.granularity === 'monthly' ? 'monthly' : 'weekly',
    lead_time_days: v.leadTime,
    risk_thresholds: { ...base.risk_thresholds, critical_margin_weeks: v.threshold },
    assistant_style: v.style === 'detailed' ? 'detailed' : 'brief',
  }
}

/** Saves the parameters, then recalculates: the backend moves the conversation back to `calculating`. */
export function ParametersSection({ runId, conversationId, open, onOpenChange }: ParametersSectionProps) {
  const { t } = useTranslation()
  const { runs } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const summary = useRunSummary(runId)
  const [draft, setDraft] = useState<ParametersValues | null>(null)

  const run = summary.data?.run
  const values = draft ?? (run ? toValues(run.parameters) : null)

  const recalculate = useMutation({
    mutationFn: async (next: RunParameters) => {
      await runs.updateParameters(runId, next)
      return runs.recalculate(runId)
    },
    onSuccess: async () => {
      onOpenChange(false)
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: runKey(runId) })
      await queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
    },
    onError: () => notify('error', t('results.parameters.saveError')),
  })

  if (!run || !values) return null

  const handleOpenChange = (next: boolean) => {
    if (!next) setDraft(null)
    onOpenChange(next)
  }

  return (
    <ParametersDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={t('results.parameters.title')}
      closeLabel={t('results.parameters.close')}
      values={values}
      onChange={(field, value) => setDraft({ ...values, [field]: value })}
      horizon={{
        label: t('results.parameters.horizon'),
        options: [
          { value: '8', label: t('results.parameters.weeks8') },
          { value: '12', label: t('results.parameters.weeks12') },
          { value: '24', label: t('results.parameters.weeks24') },
        ],
      }}
      granularity={{
        label: t('results.parameters.granularity'),
        options: [
          { value: 'weekly', label: t('results.parameters.weekly') },
          { value: 'monthly', label: t('results.parameters.monthly') },
        ],
      }}
      leadTime={{
        label: t('results.parameters.leadTime'),
        decrementLabel: t('results.parameters.leadTimeDecrement'),
        incrementLabel: t('results.parameters.leadTimeIncrement'),
        unit: t('results.parameters.days'),
        min: 1,
        max: 180,
      }}
      threshold={{
        label: t('results.parameters.threshold'),
        decrementLabel: t('results.parameters.thresholdDecrement'),
        incrementLabel: t('results.parameters.thresholdIncrement'),
        unit: t('results.parameters.weeksUnit'),
        min: 0,
        max: 26,
      }}
      style={{
        label: t('results.parameters.style'),
        options: [
          { value: 'brief', label: t('results.parameters.brief') },
          { value: 'detailed', label: t('results.parameters.detailed') },
        ],
      }}
      recalculateLabel={t('results.parameters.recalculate')}
      onRecalculate={() => recalculate.mutate(toParameters(run.parameters, values))}
      recalculating={recalculate.isPending}
    />
  )
}
