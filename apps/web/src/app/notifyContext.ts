import { createContext, use } from 'react'

export type NotifyVariant = 'info' | 'success' | 'error'

export interface NotifyOptions {
  /** A single follow-up action shown on the toast, for example "Undo". */
  action?: { label: string; onAction: () => void }
  /** Auto-dismiss delay in ms; the provider default applies when omitted. */
  duration?: number
}

export type Notify = (variant: NotifyVariant, title: string, options?: NotifyOptions) => void

export const NotifyContext = createContext<Notify | null>(null)

export function useNotify(): Notify {
  const notify = use(NotifyContext)
  if (!notify) throw new Error('useNotify must be used inside <NotificationsProvider>')
  return notify
}
