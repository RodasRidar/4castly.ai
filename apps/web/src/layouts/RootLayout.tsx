import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { NotificationsProvider } from '../app/notifications'
import { useClientNavigation } from '../app/useClientNavigation'
import { OfflineBanner } from './OfflineBanner'

/** Providers, skip link, toasts. Every route renders inside it. */
export function RootLayout() {
  const { t } = useTranslation()
  const onClick = useClientNavigation()
  return (
    // `contents` keeps the wrapper out of layout; it only exists to catch clicks bubbling from links (portals included).
    <div className="contents" onClick={onClick}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
      >
        {t('common.skipToContent')}
      </a>
      <OfflineBanner />
      <NotificationsProvider>
        <Outlet />
      </NotificationsProvider>
    </div>
  )
}
