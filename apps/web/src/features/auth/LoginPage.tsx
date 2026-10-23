import { useTranslation } from 'react-i18next'

/** Placeholder: the real form (email + OTP) is F4. */
export function LoginPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-heading-md font-semibold text-ink">{t('auth.loginTitle')}</h1>
      <p className="text-body-md text-body">{t('auth.loginBody')}</p>
      <p className="text-body-sm text-mute">{t('auth.loginPlaceholder')}</p>
    </div>
  )
}

export function AuthCallbackPage() {
  const { t } = useTranslation()
  return <p className="text-body-md text-body">{t('auth.callbackTitle')}</p>
}
