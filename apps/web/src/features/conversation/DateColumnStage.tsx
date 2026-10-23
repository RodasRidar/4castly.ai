import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServices } from '../../services/servicesContext'
import type { ConversationDetail, PlanView } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { DateColumnPicker } from '../../ui/organisms/DateColumnPicker'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { PlanLoader } from './PlanLoader'
import { buildDatePlan } from './planModel'
import { usePlanQuery } from './useConversationData'
import { useRefreshConversation } from './useRefreshConversation'

type Notice = 'noDates' | 'incompletePlan' | 'confirmError' | null

function Picker({ conversation, plan }: { conversation: ConversationDetail; plan: PlanView }) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const refresh = useRefreshConversation(conversation.id)
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const confirm = useMutation({
    mutationFn: (column: string) => {
      const next = buildDatePlan(plan, conversation.upload?.profile, column)
      if (!next) throw new Error('incomplete plan')
      return conversations.confirmPlan(conversation.id, { plan: next })
    },
    onSuccess: refresh,
    onError: (error) => setNotice(error.message === 'incomplete plan' ? 'incompletePlan' : 'confirmError'),
  })

  return (
    <div className="flex flex-col gap-4">
      <DateColumnPicker
        label={t('conversation.dates.listLabel')}
        columns={plan.date_column_candidates.map((c) => ({ id: c.column, name: c.column, samples: c.samples }))}
        value={selected}
        onSelect={(id) => {
          setSelected(id)
          setNotice(null)
        }}
        noDatesLabel={t('conversation.dates.noDates')}
        // A forecast cannot exist without dates, so this never confirms anything: it explains and keeps the picker.
        onNoDates={() => setNotice('noDates')}
        emptyText={t('conversation.dates.empty')}
        disabled={confirm.isPending}
      />
      <div>
        <Button
          disabled={!selected || confirm.isPending}
          loading={confirm.isPending}
          onClick={() => {
            if (selected) confirm.mutate(selected)
          }}
        >
          {t('conversation.dates.use')}
        </Button>
      </div>
      {notice && <InlineNotice tone="warning">{t(`conversation.dates.${notice === 'noDates' ? 'noDatesNotice' : notice}`)}</InlineNotice>}
    </div>
  )
}

/** Frame 08b: the file has no recognisable date column; the user picks one of the plausible candidates. */
export function DateColumnStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const plan = usePlanQuery(conversation.id, true)
  const card = <PlanLoader query={plan}>{(view) => <Picker conversation={conversation} plan={view} />}</PlanLoader>
  return (
    <ConversationFrame
      conversation={conversation}
      lockedReason={t('conversation.composer.lockedBeforeConfirm')}
      messages={[assistantMessage('dates', t('conversation.thread.assistant'), t('conversation.dates.assistant'), card)]}
    />
  )
}
