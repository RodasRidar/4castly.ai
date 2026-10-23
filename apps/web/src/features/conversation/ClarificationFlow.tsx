import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServices } from '../../services/servicesContext'
import type { ClarificationQuestion, ConversationDetail, ForecastRequest, PlanView } from '../../services/types'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { ClarificationCard } from '../../ui/organisms/ClarificationCard'
import { backendKey, buildClarification, toAnswers } from './clarification'
import { useRememberedAnswers } from './useConversationData'
import { useRefreshConversation } from './useRefreshConversation'

const isPositiveWhole = (raw: string) => /^\d+$/.test(raw.trim()) && Number(raw) > 0

/** The two questions and the Calcular / Omitir actions. Used while clarifying and when a failed forecast retries. */
export function ClarificationFlow({ conversation, plan }: { conversation: ConversationDetail; plan: PlanView }) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const refresh = useRefreshConversation(conversation.id)
  const remembered = useRememberedAnswers(conversation.id)
  const payload = buildClarification(plan)
  const [leadTime, setLeadTime] = useState<string | null>(null)
  const [stockouts, setStockouts] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const start = useMutation({
    mutationFn: (request: ForecastRequest) => conversations.startForecast(conversation.id, request),
    onSuccess: refresh,
    onError: () => setFailed(true),
  })
  const run = (request: ForecastRequest) => {
    if (start.isPending) return
    setFailed(false)
    remembered.set(request.skip ? null : (request.answers ?? null))
    start.mutate(request)
  }

  const optionsOf = (question: ClarificationQuestion | undefined) =>
    (question?.options ?? []).map((o) => ({ value: o.value, label: t(backendKey(o.label_key)) }))
  const leadQuestion = payload.questions.find((q) => q.id === 'lead_time_days')
  const stockQuestion = payload.questions.find((q) => q.id === 'had_stockouts')

  return (
    <div className="flex flex-col gap-3">
      <ClarificationCard
        title={t('conversation.clarification.title')}
        leadTime={{
          label: t('conversation.clarification.leadTimeQuestion'),
          options: optionsOf(leadQuestion),
          other: leadQuestion?.allows_other
            ? {
                label: t('conversation.clarification.other'),
                inputLabel: t('conversation.clarification.otherInput'),
                placeholder: t('conversation.clarification.otherPlaceholder'),
              }
            : undefined,
        }}
        // Typed text only counts once it is a positive whole number of days.
        leadTimeValue={leadTime !== null && isPositiveWhole(leadTime) ? leadTime : null}
        onLeadTimeChange={setLeadTime}
        stockout={{ label: t('conversation.clarification.stockoutQuestion'), options: optionsOf(stockQuestion) }}
        stockoutValue={stockouts}
        onStockoutChange={setStockouts}
        showStockoutQuestion={!!stockQuestion}
        calculateLabel={t('conversation.clarification.calculate')}
        skipLabel={t('conversation.clarification.skip')}
        onCalculate={() => {
          const answers = toAnswers(leadTime ?? '', stockQuestion ? stockouts : null)
          if (answers) run({ answers, skip: false })
        }}
        onSkip={() => run({ skip: true })}
        submitting={start.isPending}
      />
      {failed && <InlineNotice tone="warning">{t('conversation.clarification.startError')}</InlineNotice>}
    </div>
  )
}
