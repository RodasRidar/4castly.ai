import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServices } from '../../services/servicesContext'
import type { ConversationDetail, MappedField, PlanConfirmation, PlanView } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { ColumnMappingCard, type ColumnMapping } from '../../ui/organisms/ColumnMappingCard'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { MovementRules } from './MovementRules'
import { PlanLoader } from './PlanLoader'
import { PlanSummary, WarningList } from './PlanSummary'
import { applyMapping, columnsOf, planRows, type FieldMapping } from './planModel'
import { usePlanQuery } from './useConversationData'
import { useWarningTexts } from './useWarningTexts'
import { useRefreshConversation } from './useRefreshConversation'

type Failure = 'confirmError' | 'requiredColumns' | null

function Confirmation({ conversation, plan }: { conversation: ConversationDetail; plan: PlanView }) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const refresh = useRefreshConversation(conversation.id)
  const warnings = useWarningTexts(plan)
  const profile = conversation.upload?.profile
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [sheet, setSheet] = useState(plan.selected_sheet ?? plan.sheets[0] ?? '')
  const [failure, setFailure] = useState<Failure>(null)

  const confirm = useMutation({
    mutationFn: (confirmation: PlanConfirmation) => conversations.confirmPlan(conversation.id, confirmation),
    onSuccess: refresh,
    onError: () => setFailure('confirmError'),
  })
  const send = (confirmation: PlanConfirmation) => {
    if (confirm.isPending) return
    setFailure(null)
    confirm.mutate(confirmation)
  }

  const kardex = plan.source_kind === 'kardex'
  const sheetColumns = columnsOf(profile, sheet).map((c) => c.name)
  const available = sheetColumns.length > 0 ? sheetColumns : plan.mappings.flatMap((m) => (m.column ? [m.column] : []))
  // After switching sheet, columns that do not exist there are cleared so the user must choose again.
  const rows = planRows(plan, (field: MappedField) => t(`conversation.fields.${field}`)).map((r) =>
    r.column && !available.includes(r.column) ? { ...r, column: null } : r,
  )

  const save = (mapping: ColumnMapping) => {
    const next = applyMapping(plan, mapping as FieldMapping, sheet, profile)
    if (!next) return setFailure('requiredColumns')
    send({ plan: next })
  }

  return (
    <div className="flex flex-col gap-4">
      <PlanSummary plan={plan} />
      {kardex ? (
        <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-elevated p-5">
          <h2 className="text-body-lg font-medium text-ink">{t('conversation.confirm.movementsTitle')}</h2>
          <MovementRules plan={plan} />
          <WarningList plan={plan} />
          <div>
            <Button onClick={() => send({})}>{t('conversation.confirm.confirm')}</Button>
          </div>
        </section>
      ) : (
        <ColumnMappingCard
          key={`${sheet}-${mode}`}
          mode={mode}
          title={t('conversation.confirm.title')}
          rows={rows}
          columns={available}
          confirmLabel={t('conversation.confirm.confirm')}
          editLabel={t('conversation.confirm.edit')}
          saveLabel={t('conversation.confirm.save')}
          cancelLabel={t('conversation.confirm.cancel')}
          emptyOptionLabel={t('conversation.confirm.emptyOption')}
          emptyText={t('conversation.confirm.emptyText')}
          sheet={{
            label: t('conversation.confirm.sheet'),
            value: sheet,
            options: plan.sheets.map((s) => ({ value: s, label: s })),
            onChange: (value) => {
              setSheet(value)
              setMode('edit')
            },
          }}
          warnings={warnings}
          onConfirm={() => send({})}
          onEdit={() => setMode('edit')}
          onSave={save}
          onCancel={() => {
            setMode('read')
            setSheet(plan.selected_sheet ?? plan.sheets[0] ?? '')
            setFailure(null)
          }}
        />
      )}
      {failure && <InlineNotice tone="warning">{t(`conversation.confirm.${failure}`)}</InlineNotice>}
    </div>
  )
}

/** awaiting_confirmation (frames 04 read-only and 04-edición): the user checks how the file was understood. */
export function ConfirmationStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const plan = usePlanQuery(conversation.id, true)
  const card = <PlanLoader query={plan}>{(view) => <Confirmation conversation={conversation} plan={view} />}</PlanLoader>
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedBeforeConfirm')}
      messages={[assistantMessage('confirm', t('conversation.thread.assistant'), t('conversation.confirm.assistant'), card)]}
    />
  )
}
