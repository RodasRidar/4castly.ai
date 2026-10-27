import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMatch, useNavigate } from 'react-router'
import { useServices } from '../services/servicesContext'
import { ConversationMenu } from '../ui/organisms/ConversationMenu'
import { Sidebar } from '../ui/organisms/Sidebar'
import { ConnectedUserMenu } from './ConnectedUserMenu'
import { groupConversations } from './groupConversations'
import { conversationsKey } from './keys'
import { useDeleteConversation } from './useDeleteConversation'

interface AppSidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobile?: { open: boolean; onOpenChange: (open: boolean) => void }
}

export function AppSidebar({ collapsed, onToggleCollapsed, mobile }: AppSidebarProps) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeId = useMatch('/c/:conversationId/*')?.params.conversationId
  const [renamingId, setRenamingId] = useState<string>()

  const list = useQuery({ queryKey: conversationsKey, queryFn: () => conversations.list() })
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsKey })
  const pin = useMutation({ mutationFn: (v: { id: string; pinned: boolean }) => conversations.update(v.id, { pinned: v.pinned }), onSettled: refresh })
  const rename = useMutation({ mutationFn: (v: { id: string; title: string }) => conversations.update(v.id, { title: v.title }), onSettled: refresh })
  const archive = useMutation({ mutationFn: (id: string) => conversations.update(id, { archived: true }), onSettled: refresh })
  const leaveIfActive = (id: string) => {
    if (id === activeId) void navigate('/nuevo')
  }
  const remove = useDeleteConversation(leaveIfActive)

  const groups = groupConversations(list.data ?? [], {
    pinned: t('conversations.pinned'),
    today: t('conversations.today'),
    this_week: t('conversations.thisWeek'),
    older: t('conversations.earlier'),
  }).map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, active: i.id === activeId })) }))

  return (
    <Sidebar
      label={t('nav.sidebar')}
      collapsed={collapsed}
      collapseLabel={t('nav.collapse')}
      expandLabel={t('nav.expand')}
      onToggleCollapsed={onToggleCollapsed}
      newLabel={t('nav.newForecast')}
      onNew={() => void navigate('/nuevo')}
      historyLabel={t('nav.history')}
      historyHref="/historial"
      mobile={mobile && { ...mobile, title: t('nav.sidebar'), closeLabel: t('common.close') }}
      list={{
        label: t('nav.conversations'),
        groups,
        state: list.isPending ? 'loading' : list.isError ? 'error' : 'ready',
        loadingLabel: t('common.loading'),
        emptyTitle: t('conversations.emptyTitle'),
        emptyBody: t('conversations.emptyBody'),
        errorTitle: t('conversations.errorTitle'),
        errorBody: t('conversations.errorBody'),
        retryLabel: t('common.retry'),
        onRetry: () => void list.refetch(),
        pinnedLabel: t('conversations.pinned'),
        processingLabel: t('conversations.processing'),
        failedLabel: t('conversations.failed'),
        renameLabel: t('conversations.rename'),
        renamingId,
        onRename: (id, title) => {
          setRenamingId(undefined)
          if (title.trim()) rename.mutate({ id, title: title.trim() })
        },
        onRenameCancel: () => setRenamingId(undefined),
        renderMenu: (item) => (
          <ConversationMenu
            triggerLabel={t('conversations.menu')}
            pinned={item.pinned}
            pinLabel={t('conversations.pin')}
            unpinLabel={t('conversations.unpin')}
            renameLabel={t('conversations.rename')}
            archiveLabel={t('conversations.archive')}
            deleteLabel={t('conversations.delete')}
            confirmTitle={t('conversations.confirmDeleteTitle')}
            confirmDescription={t('conversations.confirmDeleteBodyNamed', { title: item.title })}
            confirmLabel={t('conversations.delete')}
            cancelLabel={t('conversations.cancel')}
            closeLabel={t('common.close')}
            onPin={() => pin.mutate({ id: item.id, pinned: !item.pinned })}
            onRename={() => setRenamingId(item.id)}
            onArchive={() => {
              archive.mutate(item.id)
              leaveIfActive(item.id)
            }}
            onDelete={() => {
              remove.mutate(item.id)
            }}
          />
        ),
      }}
      footer={<ConnectedUserMenu compact={collapsed && !mobile} />}
    />
  )
}
