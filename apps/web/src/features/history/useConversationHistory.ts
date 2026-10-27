import { useInfiniteQuery } from '@tanstack/react-query'
import { conversationsKey } from '../../layouts/keys'
import { useServices } from '../../services/servicesContext'
import { historyConfig } from './historyConfig'

/** Sits under `conversationsKey`, so every change that refreshes the sidebar refreshes the history too. */
export function useConversationHistory(q: string, archived: boolean) {
  const { conversations } = useServices()
  return useInfiniteQuery({
    queryKey: [...conversationsKey, 'history', { q, archived }],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      conversations.search({ q: q || undefined, includeArchived: archived, cursor: pageParam, limit: historyConfig.pageSize }),
    getNextPageParam: (last) => last.nextCursor,
  })
}
