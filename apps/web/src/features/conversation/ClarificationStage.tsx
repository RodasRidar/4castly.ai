import { useTranslation } from 'react-i18next'
import type { ConversationDetail } from '../../services/types'
import { ConfirmedDataLine } from '../../ui/organisms/ConfirmedDataLine'
import { ClarificationFlow } from './ClarificationFlow'
import { buildClarification } from './clarification'
import { ConversationFrame } from './ConversationFrame'
import { assistantMessage } from './threadMessages'
import { MappingDetail } from './MappingDetail'
import { PlanLoader } from './PlanLoader'
import { usePlanQuery } from './useConversationData'

/** confirmed | clarifying (frames 04-confirmado and 05): data confirmed, composer open, questions pending. */
export function ClarificationStage({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const plan = usePlanQuery(conversation.id, true)
  const clarifying = conversation.stage === 'clarifying'

  const confirmedCard = (
    <PlanLoader query={plan}>
      {(view) => (
        <ConfirmedDataLine
          summaryLabel={t('conversation.confirmed.summary')}
          toggleLabel={t('conversation.confirmed.toggle')}
          hideLabel={t('conversation.confirmed.hide')}
        >
          <MappingDetail plan={view} />
        </ConfirmedDataLine>
      )}
    </PlanLoader>
  )
  const questionCount = plan.data ? buildClarification(plan.data).questions.length : 2
  const messages = [
    assistantMessage(
      'confirmed',
      t('conversation.thread.assistant'),
      clarifying ? t(questionCount === 1 ? 'conversation.confirmed.assistantOne' : 'conversation.confirmed.assistant') : undefined,
      confirmedCard,
    ),
  ]
  if (clarifying && plan.data) {
    messages.push(
      assistantMessage('clarification', t('conversation.thread.assistant'), undefined, <ClarificationFlow conversation={conversation} plan={plan.data} />),
    )
  }
  return <ConversationFrame conversation={conversation} lockedReason={null} suggestions messages={messages} />
}
