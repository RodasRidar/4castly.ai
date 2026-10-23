import { useOutletContext } from 'react-router'
import type { ConversationDetail } from '../../services/types'

/** `ConversationLayout` loads the conversation once and hands it to the child routes through the outlet. */
export interface ConversationOutlet {
  conversation: ConversationDetail
}

export function useConversationOutlet(): ConversationDetail {
  return useOutletContext<ConversationOutlet>().conversation
}
