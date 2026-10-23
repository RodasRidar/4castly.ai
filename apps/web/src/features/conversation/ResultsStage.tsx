import type { ConversationDetail } from '../../services/types'
import { ResultsScreen } from '../results/ResultsScreen'

/** The `ready` stage: results next to the chat, or the portfolio (built in features/results). */
export function ResultsStage({ conversation }: { conversation: ConversationDetail }) {
  return <ResultsScreen conversation={conversation} />
}
