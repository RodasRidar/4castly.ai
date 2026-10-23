import { createContext, use } from 'react'

export type NotifyVariant = 'info' | 'success' | 'error'

export const NotifyContext = createContext<((variant: NotifyVariant, title: string) => void) | null>(null)

export function useNotify() {
  const notify = use(NotifyContext)
  if (!notify) throw new Error('useNotify must be used inside <NotificationsProvider>')
  return notify
}
