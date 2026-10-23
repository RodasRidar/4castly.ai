import { useQuery } from '@tanstack/react-query'
import { Outlet, useParams } from 'react-router'
import { useServices } from '../services/servicesContext'
import { NotFoundPage } from '../features/errors/NotFoundPage'
import { conversationsKey } from './keys'

/**
 * Frame for /c/:conversationId. F4-F5 add the stage switch (chat only, or chat + results) here; for now it
 * guards against ids that are not in the user's list and renders the child route.
 */
export function ConversationLayout() {
  const { conversationId } = useParams()
  const { conversations } = useServices()
  const list = useQuery({ queryKey: conversationsKey, queryFn: () => conversations.list() })
  if (list.data && !list.data.some((c) => c.id === conversationId)) return <NotFoundPage />
  return (
    <div className="flex h-full min-h-0 flex-col" data-conversation-id={conversationId}>
      <Outlet />
    </div>
  )
}
