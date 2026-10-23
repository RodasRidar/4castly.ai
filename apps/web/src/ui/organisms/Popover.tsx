import { Popover as RadixPopover } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PopoverProps {
  trigger: ReactNode
  /** Accessible name of the popover content. */
  label: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  children: ReactNode
}

export function Popover({ trigger, label, align = 'start', side = 'top', className, children }: PopoverProps) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          aria-label={label}
          align={align}
          side={side}
          sideOffset={6}
          className={cn('z-50 min-w-60 rounded-lg border border-hairline bg-elevated p-2 shadow-popover', className)}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
