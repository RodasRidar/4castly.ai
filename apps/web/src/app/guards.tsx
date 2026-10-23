import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../ui/atoms/Spinner'
import { useSyncPreferences } from './preferences'
import { safeNext } from './safeNext'
import { useSession } from './session'

function Pending() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <Spinner label={t('common.loading')} />
    </div>
  )
}

/** Anonymous visitors go to /login and come back to where they were headed. */
export function RequireAuth() {
  const { data: user, isPending } = useSession()
  const location = useLocation()
  if (isPending) return <Pending />
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <SignedIn />
}

function SignedIn() {
  // Theme and language follow the saved preferences from the first signed-in render.
  useSyncPreferences()
  return <Outlet />
}

/** Signed-in users have nothing to do on the auth screens. */
export function RedirectIfAuthed() {
  const { data: user, isPending } = useSession()
  const [params] = useSearchParams()
  if (isPending) return <Pending />
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}
