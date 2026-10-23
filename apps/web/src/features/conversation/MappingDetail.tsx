import { useTranslation } from 'react-i18next'
import type { PlanView } from '../../services/types'
import { MovementRules } from './MovementRules'

/** Read-only recap of what was confirmed, shown under "Ver detalle". */
export function MappingDetail({ plan }: { plan: PlanView }) {
  const { t } = useTranslation()
  if (plan.source_kind === 'kardex') return <MovementRules plan={plan} />
  return (
    <dl className="flex flex-col gap-1">
      {plan.mappings.map((m) => (
        <div key={m.field} className="flex flex-wrap gap-x-3">
          <dt className="w-44 text-body-md text-mute">{t(`conversation.fields.${m.field}`)}</dt>
          <dd className="font-mono text-body-md text-ink">{m.column ?? t('conversation.confirm.emptyOption')}</dd>
        </div>
      ))}
    </dl>
  )
}
