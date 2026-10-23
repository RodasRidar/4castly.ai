import { useTranslation } from 'react-i18next'
import type { PlanView } from '../../services/types'

/** Warning copy by contract code; `count` and `params` feed i18n plurals and interpolation. */
export function useWarningTexts(plan: PlanView): string[] {
  const { t } = useTranslation()
  return plan.warnings.map((w) =>
    t(`conversation.warnings.${w.code}`, { ...w.params, count: w.count ?? 0, defaultValue: t('conversation.warnings.unknown') }),
  )
}
