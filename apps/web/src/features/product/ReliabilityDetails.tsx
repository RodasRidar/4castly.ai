import { useTranslation } from 'react-i18next'
import type { ProductDetail } from '../../services/types'
import { useFormatters } from './useFormatters'

/** The disclosure body of the reliability card: plain facts, no statistics vocabulary. */
export function ReliabilityDetails({ reliability }: { reliability: ProductDetail['reliability'] }) {
  const { t } = useTranslation()
  const { number } = useFormatters()
  const rows: [string, string][] = [
    [t('product.reliability.method'), t(`product.reliability.methodValue.${reliability.method}`)],
    [t('product.reliability.historyWeeks'), number(reliability.history_weeks)],
    [t('product.reliability.completeWeeks'), number(reliability.non_censored_weeks)],
    [
      t('product.reliability.testError'),
      reliability.backtest_error_pct == null
        ? t('product.reliability.notAvailable')
        : t('product.reliability.testErrorValue', { value: number(reliability.backtest_error_pct) }),
    ],
  ]
  return (
    <dl className="flex flex-col gap-1">
      {rows.map(([term, value]) => (
        <div key={term} className="flex items-baseline justify-between gap-3">
          <dt className="text-mute">{term}</dt>
          <dd className="font-mono text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
