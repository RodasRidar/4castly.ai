import { History, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { IconButton } from '../atoms/IconButton'
import { Logo } from '../atoms/Logo'
import { ConversationList, type ConversationListProps } from './ConversationList'
import { Drawer } from './Drawer'

export interface SidebarProps {
  /** Accessible name of the nav landmark. */
  label: string
  collapsed?: boolean
  collapseLabel: string
  expandLabel: string
  onToggleCollapsed: () => void
  newLabel: string
  onNew: () => void
  list: ConversationListProps
  historyLabel: string
  historyHref: string
  /** User card / UserMenu slot (render the compact UserMenu when collapsed). */
  footer: ReactNode
  /** Renders the sidebar inside a left Drawer (mobile). The collapse control is omitted. */
  mobile?: { open: boolean; onOpenChange: (open: boolean) => void; title: string; closeLabel: string }
  className?: string
}

export function Sidebar({
  label,
  collapsed = false,
  collapseLabel,
  expandLabel,
  onToggleCollapsed,
  newLabel,
  onNew,
  list,
  historyLabel,
  historyHref,
  footer,
  mobile,
  className,
}: SidebarProps) {
  const rail = collapsed && !mobile

  const nav = (
    <nav
      aria-label={label}
      data-collapsed={rail || undefined}
      className={cn(
        'flex h-full min-h-0 flex-col gap-4 border-hairline bg-canvas',
        mobile ? 'w-full' : rail ? 'w-14 items-center border-r p-2' : 'w-[260px] border-r p-3',
        className,
      )}
    >
      <div className={cn('flex items-center', rail ? 'flex-col gap-2' : 'justify-between')}>
        <Logo variant={rail ? 'mark' : 'full'} />
        {!mobile && <IconButton label={rail ? expandLabel : collapseLabel} icon={rail ? PanelLeftOpen : PanelLeftClose} size="sm" onClick={onToggleCollapsed} />}
      </div>
      {rail ? (
        <IconButton variant="outline" label={newLabel} icon={Plus} onClick={onNew} />
      ) : (
        <Button variant="secondary" className="w-full" iconLeft={<Icon icon={Plus} />} onClick={onNew}>
          {newLabel}
        </Button>
      )}
      {rail ? <div className="flex-1" /> : <ConversationList {...list} className={cn('min-h-0 flex-1 overflow-y-auto', list.className)} />}
      {rail ? (
        <a
          href={historyHref}
          aria-label={historyLabel}
          className="flex size-9 items-center justify-center rounded-md text-body hover:bg-selected hover:text-ink"
        >
          <Icon icon={History} />
        </a>
      ) : (
        <a href={historyHref} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-md text-body hover:bg-selected hover:text-ink">
          <Icon icon={History} />
          {historyLabel}
        </a>
      )}
      <div className={cn(!rail && 'border-t border-hairline pt-2')}>{footer}</div>
    </nav>
  )

  if (mobile) {
    return (
      <Drawer open={mobile.open} onOpenChange={mobile.onOpenChange} title={mobile.title} closeLabel={mobile.closeLabel} side="left">
        {nav}
      </Drawer>
    )
  }
  return nav
}
