import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../ui/atoms/Icon'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Polite notice while the browser has no connection (R13). Queries retry on their own when it returns. */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  const text = t('common.offline')
  return (
    <div
      role="status"
      aria-label={text}
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-hairline bg-elevated px-3 py-2 text-body-md text-ink"
    >
      <Icon icon={WifiOff} />
      <span>{text}</span>
    </div>
  )
}
