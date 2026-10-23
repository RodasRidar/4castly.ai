import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Toast as RadixToast } from 'radix-ui'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export interface ToastProviderProps {
  /** Accessible name of the notifications region (viewport). */
  label: string
  /** Auto-dismiss delay in ms. */
  duration?: number
  children?: ReactNode
}

/** Wires Radix Provider + Viewport. Mount once near the app root; render `Toast`s as children. */
export function ToastProvider({ label, duration = 5000, children }: ToastProviderProps) {
  return (
    <RadixToast.Provider label={label} duration={duration}>
      {children}
      <RadixToast.Viewport
        label={label}
        className="fixed right-4 bottom-4 z-50 m-0 flex w-96 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none"
      />
    </RadixToast.Provider>
  )
}

export interface ToastProps {
  variant: 'info' | 'success' | 'error'
  title: string
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Label of the dismiss button (accessible name). */
  dismissLabel: string
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

const variants = {
  info: { icon: Info, box: 'border-hairline bg-elevated', tone: 'text-mute' },
  success: { icon: CircleCheck, box: 'border-optimal-border bg-optimal-bg', tone: 'text-optimal' },
  error: { icon: CircleAlert, box: 'border-critical-border bg-critical-bg', tone: 'text-critical' },
} as const

export function Toast({ variant, title, description, open, onOpenChange, dismissLabel, actionLabel, onAction, duration }: ToastProps) {
  const v = variants[variant]
  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      type={variant === 'error' ? 'foreground' : 'background'}
      data-variant={variant}
      className={cn('flex items-start gap-3 rounded-md border p-3 text-ink shadow-popover', v.box)}
    >
      <span className={v.tone}>
        <Icon icon={v.icon} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RadixToast.Title className="text-body-md font-medium">{title}</RadixToast.Title>
        {description && <RadixToast.Description className="text-body-sm text-body">{description}</RadixToast.Description>}
      </div>
      {actionLabel && (
        <RadixToast.Action altText={actionLabel} onClick={onAction} className="rounded-md px-2 py-1 text-body-sm font-medium text-ink hover:bg-selected">
          {actionLabel}
        </RadixToast.Action>
      )}
      <RadixToast.Close aria-label={dismissLabel} className="rounded-md p-1 text-mute hover:bg-selected hover:text-ink">
        <Icon icon={X} size="sm" />
      </RadixToast.Close>
    </RadixToast.Root>
  )
}
