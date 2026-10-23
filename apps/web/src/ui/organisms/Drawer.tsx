import { X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from '../atoms/IconButton'
import { useReturnFocus } from './useReturnFocus'

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  side?: 'right' | 'left'
  children?: ReactNode
}

export function Drawer({ open, onOpenChange, title, closeLabel, side = 'right', children }: DrawerProps) {
  const returnFocus = useReturnFocus(open)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          onCloseAutoFocus={returnFocus}
          data-side={side}
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 z-50 flex w-[min(100vw,26rem)] flex-col gap-4 border-hairline bg-elevated p-6 shadow-popover',
            side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          )}
        >
          <RadixDialog.Title className="pr-10 text-heading-md font-semibold text-ink">{title}</RadixDialog.Title>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <RadixDialog.Close asChild>
            <IconButton label={closeLabel} icon={X} size="sm" className="absolute top-4 right-4" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
