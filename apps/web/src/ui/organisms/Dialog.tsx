import { X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { IconButton } from '../atoms/IconButton'
import { useReturnFocus } from './useReturnFocus'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  children?: ReactNode
}

export function Dialog({ open, onOpenChange, title, description, closeLabel, children }: DialogProps) {
  const returnFocus = useReturnFocus(open)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-hairline bg-elevated p-6 shadow-popover"
        >
          <RadixDialog.Title className="pr-10 text-heading-md font-semibold text-ink">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="text-body-md text-body">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children}
          <RadixDialog.Close asChild>
            <IconButton label={closeLabel} icon={X} size="sm" className="absolute top-4 right-4" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
