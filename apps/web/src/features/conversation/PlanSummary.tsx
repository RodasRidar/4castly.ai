import { useTranslation } from 'react-i18next'
import type { PlanView } from '../../services/types'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { formatCalendarDate, historyParts } from './format'
import { useWarningTexts } from './useWarningTexts'

/** "Encontré 26 productos y 9 meses de historia." built from the contract's `summary`, never from client counts. */
export function PlanSummary({ plan }: { plan: PlanView }) {
  const { t, i18n } = useTranslation()
  const summary = plan.summary
  if (!summary) return null
  const { years, months } = historyParts(summary.history_weeks)
  const parts = [
    years > 0 ? t('conversation.history.years', { count: years }) : null,
    months > 0 ? t('conversation.history.months', { count: months }) : null,
  ].filter((p): p is string => p !== null)
  const history = parts.length === 2 ? t('conversation.history.join', { years: parts[0], months: parts[1] }) : parts[0]
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body-md text-ink">{t('conversation.confirm.summary', { count: summary.products_found, history })}</p>
      {summary.date_from && summary.date_to && (
        <p className="text-body-sm text-mute">
          {t('conversation.confirm.dateRange', {
            from: formatCalendarDate(summary.date_from, i18n.language),
            to: formatCalendarDate(summary.date_to, i18n.language),
          })}
        </p>
      )}
    </div>
  )
}

export function WarningList({ plan }: { plan: PlanView }) {
  const texts = useWarningTexts(plan)
  if (texts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {texts.map((text) => (
        <InlineNotice key={text} tone="warning">
          {text}
        </InlineNotice>
      ))}
    </div>
  )
}
