import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/atoms/Button'
import { Spinner } from '../ui/atoms/Spinner'
import { ErrorState } from '../ui/molecules/ErrorState'
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

function SessionError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <ErrorState
        title={t('pages.sessionErrorTitle')}
        body={t('pages.sessionErrorBody')}
        primaryAction={<Button onClick={onRetry}>{t('common.retry')}</Button>}
      />
    </div>
  )
}

/** Anonymous visitors go to /login and come back to where they were headed. */
export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useSession()
  const location = useLocation()
  if (isPending) return <Pending />
  // A failed /me is not "signed out": say so and let the user retry instead of bouncing them to /login.
  if (isError) return <SessionError onRetry={() => void refetch()} />
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
