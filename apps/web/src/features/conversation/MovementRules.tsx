import { useTranslation } from 'react-i18next'
import type { PlanView } from '../../services/types'

/** Kardex reports: which movement codes count as demand, subtract as returns or are ignored. Read-only. */
export function MovementRules({ plan }: { plan: PlanView }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-md text-body">{t('conversation.confirm.movementsIntro')}</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {plan.movement_rules.map((rule) => (
          <li key={rule.code} className="flex items-baseline justify-between gap-4 py-2">
            <span className="text-body-md text-ink">{rule.label}</span>
            <span className="text-body-sm text-mute">{t(`conversation.confirm.treatment.${rule.treatment}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
