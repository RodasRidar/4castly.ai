import { useQueryClient } from '@tanstack/react-query'
import { conversationKey, planKey } from './useConversationData'

/** After a mutation the backend decides the next stage; refetch instead of guessing it. */
export function useRefreshConversation(id: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: conversationKey(id) }),
      queryClient.invalidateQueries({ queryKey: planKey(id) }),
    ])
}
