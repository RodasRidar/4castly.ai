import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast, ToastProvider } from '../ui/molecules/Toast'
import { NotifyContext, type Notify, type NotifyOptions, type NotifyVariant } from './notifyContext'

interface Notice extends NotifyOptions {
  id: number
  variant: NotifyVariant
  title: string
}

/** One toast at a time is enough for the shell; a queue can replace this if more screens need it. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [open, setOpen] = useState(false)
  const notify = useCallback<Notify>((variant, title, options) => {
    setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, variant, title, ...options }))
    setOpen(true)
  }, [])

  return (
    <NotifyContext value={notify}>
      <ToastProvider label={t('common.notifications')}>
        {children}
        {notice && (
          <Toast
            key={notice.id}
            variant={notice.variant}
            title={notice.title}
            open={open}
            onOpenChange={setOpen}
            dismissLabel={t('common.dismiss')}
            duration={notice.duration}
            actionLabel={notice.action?.label}
            onAction={notice.action?.onAction}
          />
        )}
      </ToastProvider>
    </NotifyContext>
  )
}
