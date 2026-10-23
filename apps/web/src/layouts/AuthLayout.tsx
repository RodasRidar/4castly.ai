import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Logo } from '../ui/atoms/Logo'

/** Centered card with the legal footer. Wrapped by `RedirectIfAuthed` in the route table. */
export function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <Logo />
      <main id="main" className="w-full max-w-sm rounded-lg border border-hairline bg-elevated p-6 shadow-popover">
        <Outlet />
      </main>
      <p className="max-w-sm text-center text-body-sm text-mute">{t('auth.legal')}</p>
    </div>
  )
}
