import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { sessionKey } from '../../app/session'
import { useServices } from '../../services/servicesContext'
import { Spinner } from '../../ui/atoms/Spinner'
import { TextLink } from '../../ui/atoms/TextLink'

/**
 * Landing page of the magic link. By the time it renders, Supabase has processed the URL; this asks once
 * whether a session exists. If it does, the session query is refreshed and `RedirectIfAuthed` sends the
 * user to `?next` (or the app). If not, the link was invalid or expired.
 */
export function AuthCallbackPage() {
  const { t } = useTranslation()
  const { auth } = useServices()
  const queryClient = useQueryClient()
  const check = useQuery({ queryKey: ['auth-callback'], queryFn: () => auth.hasSession(), retry: false, gcTime: 0 })
  const signedIn = check.data === true

  useEffect(() => {
    if (signedIn) void queryClient.invalidateQueries({ queryKey: sessionKey })
  }, [signedIn, queryClient])

  if (check.isPending || signedIn) {
    return (
      <div className="flex items-center gap-3 text-body-md text-body">
        <Spinner label={t('login.callbackChecking')} />
        <span aria-hidden="true">{t('login.callbackChecking')}</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-heading-md font-semibold text-ink">{t('login.callbackTitle')}</h1>
      <p className="text-body-md text-body">{t('login.callbackBody')}</p>
      <TextLink href="/login">{t('login.callbackBack')}</TextLink>
    </div>
  )
}
