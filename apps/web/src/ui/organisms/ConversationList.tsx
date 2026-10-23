import { MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { EmptyState } from '../molecules/EmptyState'
import { ErrorState } from '../molecules/ErrorState'
import { ConversationItem } from '../molecules/ConversationItem'

export interface ConversationListEntry {
  id: string
  title: string
  href?: string
  active?: boolean
  pinned?: boolean
  status?: 'processing' | 'failed'
}

export interface ConversationListGroup {
  id: string
  /** Group heading, e.g. "Fijados", "Hoy", "Esta semana", "Antes". */
  title: string
  items: ConversationListEntry[]
}

export interface ConversationListProps {
  /** Accessible name of the list region. */
  label: string
  groups: ConversationListGroup[]
  state?: 'ready' | 'loading' | 'error'
  loadingLabel: string
  emptyTitle: string
  emptyBody: string
  errorTitle: string
  errorBody: string
  retryLabel: string
  onRetry?: () => void
  pinnedLabel: string
  processingLabel: string
  failedLabel: string
  renameLabel: string
  onSelect?: (id: string) => void
  /** Id of the item currently being renamed inline. */
  renamingId?: string
  onRename?: (id: string, value: string) => void
  onRenameCancel?: () => void
  /** Menu trigger slot per item (e.g. a ConversationMenu). */
  renderMenu?: (item: ConversationListEntry) => ReactNode
  className?: string
}

export function ConversationList({
  label,
  groups,
  state = 'ready',
  loadingLabel,
  emptyTitle,
  emptyBody,
  errorTitle,
  errorBody,
  retryLabel,
  onRetry,
  pinnedLabel,
  processingLabel,
  failedLabel,
  renameLabel,
  onSelect,
  renamingId,
  onRename,
  onRenameCancel,
  renderMenu,
  className,
}: ConversationListProps) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label={loadingLabel} aria-busy="true" className={cn('flex flex-col gap-2 px-2', className)}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7" />
        ))}
        <VisuallyHidden>{loadingLabel}</VisuallyHidden>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <ErrorState
        className={className}
        title={errorTitle}
        body={errorBody}
        primaryAction={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        }
      />
    )
  }
  const visible = groups.filter((g) => g.items.length > 0)
  if (visible.length === 0) {
    return <EmptyState className={className} icon={MessageSquare} title={emptyTitle} body={emptyBody} />
  }
  return (
    <div aria-label={label} role="group" className={cn('flex flex-col gap-4', className)}>
      {visible.map((g) => (
        <section key={g.id} aria-labelledby={`conv-group-${g.id}`} className="flex flex-col gap-1">
          <h3 id={`conv-group-${g.id}`} className="px-2 text-body-sm font-medium text-mute">
            {g.title}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={item.id}>
                <ConversationItem
                  title={item.title}
                  href={item.href}
                  onSelect={onSelect ? () => onSelect(item.id) : undefined}
                  active={item.active}
                  pinned={item.pinned}
                  pinnedLabel={pinnedLabel}
                  status={item.status}
                  statusLabel={item.status === 'failed' ? failedLabel : processingLabel}
                  menu={renderMenu?.(item)}
                  renaming={renamingId === item.id}
                  renameLabel={renameLabel}
                  onRename={(value) => onRename?.(item.id, value)}
                  onRenameCancel={onRenameCancel}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
