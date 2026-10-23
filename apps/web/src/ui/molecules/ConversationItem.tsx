import { Pin } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { StatusDot } from '../atoms/StatusDot'

export interface ConversationItemProps {
  title: string
  /** Renders the row as a link. Without it the row is a button that fires `onSelect`. */
  href?: string
  onSelect?: () => void
  active?: boolean
  pinned?: boolean
  /** Accessible name for the pinned indicator. Required when `pinned`. */
  pinnedLabel?: string
  status?: 'processing' | 'failed'
  /** Accessible name for the status dot. Required when `status` is set. */
  statusLabel?: string
  /** Menu trigger slot (e.g. an IconButton), revealed on hover/focus. */
  menu?: ReactNode
  renaming?: boolean
  /** Accessible name of the rename input. */
  renameLabel?: string
  onRename?: (value: string) => void
  onRenameCancel?: () => void
  className?: string
}

const rowClasses = 'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-md'

export function ConversationItem({
  title,
  href,
  onSelect,
  active,
  pinned,
  pinnedLabel,
  status,
  statusLabel,
  menu,
  renaming,
  renameLabel,
  onRename,
  onRenameCancel,
  className,
}: ConversationItemProps) {
  const settled = useRef(false)

  const commit = (value: string) => {
    if (settled.current) return
    settled.current = true
    onRename?.(value)
  }
  const cancel = () => {
    if (settled.current) return
    settled.current = true
    onRenameCancel?.()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e.currentTarget.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  const content = (
    <>
      {pinned && <Icon icon={Pin} size="sm" label={pinnedLabel} className="text-mute" />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {status && <StatusDot status={status} label={statusLabel ?? ''} />}
    </>
  )

  return (
    <div
      data-active={active || undefined}
      className={cn(
        'group relative flex items-center rounded-md text-body',
        active ? 'bg-selected text-ink' : 'hover:bg-selected hover:text-ink',
        className,
      )}
    >
      {renaming ? (
        <input
          // Remount per rename session so the uncontrolled value and the commit guard start fresh.
          key="rename"
          ref={(el) => {
            if (el) {
              settled.current = false
              el.focus()
              el.select()
            }
          }}
          type="text"
          defaultValue={title}
          aria-label={renameLabel}
          onKeyDown={onKeyDown}
          onBlur={(e) => commit(e.currentTarget.value)}
          className="mx-1 min-w-0 flex-1 rounded-md border border-hairline bg-elevated px-2 py-1 text-body-md text-ink"
        />
      ) : href ? (
        <a href={href} aria-current={active ? 'page' : undefined} className={rowClasses}>
          {content}
        </a>
      ) : (
        <button type="button" onClick={onSelect} aria-current={active ? 'page' : undefined} className={rowClasses}>
          {content}
        </button>
      )}
      {menu && !renaming && (
        <span className="absolute right-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">{menu}</span>
      )}
    </div>
  )
}
