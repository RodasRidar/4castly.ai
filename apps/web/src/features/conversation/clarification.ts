import type { ClarificationAnswers, ClarificationPayload, HadStockouts, PlanView } from '../../services/types'

/**
 * Backend label keys (`clarification.leadTime.days7`) live at the root of the contract's message catalogue.
 * This area's catalogue is mounted under `conversation.`, so every backend key is resolved through here.
 */
export const backendKey = (key: string): string => `conversation.${key}`

const STOCKOUT_VALUES: readonly HadStockouts[] = ['yes', 'no', 'unknown']

/**
 * Local stand-in for the clarification payload the API will send with the assistant message. Same shape as
 * the contract's `ClarificationPayload`, so swapping in the real one is a one-line change.
 */
export function buildClarification(plan: Pick<PlanView, 'source_kind' | 'mappings'>): ClarificationPayload {
  const hasStock = plan.source_kind === 'kardex' || plan.mappings.some((m) => m.field === 'stock' && m.column)
  const questions: ClarificationPayload['questions'] = [
    {
      id: 'lead_time_days',
      allows_other: true,
      options: [
        { value: '7', label_key: 'clarification.leadTime.days7' },
        { value: '14', label_key: 'clarification.leadTime.days14' },
        { value: '30', label_key: 'clarification.leadTime.days30' },
      ],
    },
  ]
  if (!hasStock) {
    questions.push({
      id: 'had_stockouts',
      allows_other: false,
      options: STOCKOUT_VALUES.map((value) => ({ value, label_key: `clarification.stockouts.${value}` })),
    })
  }
  return { kind: 'clarification', questions, answers: null }
}

/** Parses the chip/text answers into contract answers; null when lead time is not a positive whole number. */
export function toAnswers(leadTime: string, stockouts: string | null): ClarificationAnswers | null {
  if (!/^\d+$/.test(leadTime.trim())) return null
  const days = Number(leadTime)
  if (days <= 0) return null
  const answers: ClarificationAnswers = { lead_time_days: days }
  const had = STOCKOUT_VALUES.find((v) => v === stockouts)
  if (had) answers.had_stockouts = had
  return answers
}
