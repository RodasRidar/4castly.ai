import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { safeNext } from '../../app/safeNext'
import { sessionKey } from '../../app/session'
import { useServices } from '../../services/servicesContext'
import { ApiFailure } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { Input } from '../../ui/atoms/Input'
import { TextLink } from '../../ui/atoms/TextLink'
import { FormField } from '../../ui/molecules/FormField'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { OtpInput } from '../../ui/molecules/OtpInput'
import { useCountdown } from './useCountdown'

const RESEND_SECONDS = 30
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type EmailProblem = 'invalid' | 'rate_limited' | 'failed' | null

function LegalFooter() {
  const { t } = useTranslation()
  // Destinations are placeholders until the legal pages and a support address exist (contract/product request).
  return (
    <nav aria-label={t('login.footerNav')} className="mt-6 flex flex-wrap items-center gap-x-2 text-body-sm text-mute">
      <span>{t('login.copyright')}</span>
      <span aria-hidden="true">·</span>
      <TextLink href="/terminos">{t('login.terms')}</TextLink>
      <span aria-hidden="true">·</span>
      <TextLink href="/privacidad">{t('login.privacy')}</TextLink>
      <span aria-hidden="true">·</span>
      <TextLink href="/soporte">{t('login.support')}</TextLink>
    </nav>
  )
}

/** Email, then the 6-digit code. The same neutral copy follows every well-formed email (no account enumeration). */
export function LoginPage() {
  const { t } = useTranslation()
  const { auth } = useServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<EmailProblem>(null)
  const [codeProblem, setCodeProblem] = useState<'invalid' | 'failed' | null>(null)
  const [verifying, setVerifying] = useState(false)
  const countdown = useCountdown(RESEND_SECONDS)

  const request = async (address: string) => {
    setSending(true)
    setProblem(null)
    try {
      await auth.requestCode(address)
      return true
    } catch (error) {
      const status = error instanceof ApiFailure ? error.problem.status : 500
      if (status === 429) setProblem('rate_limited')
      else if (status === 422) setProblem('invalid')
      else if (status >= 500) setProblem('failed')
      else return true // Any other refusal looks like success: the UI never says whether an email is enabled.
      return false
    } finally {
      setSending(false)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!EMAIL_PATTERN.test(address)) {
      setProblem('invalid')
      return
    }
    if (await request(address)) {
      setCodeProblem(null)
      countdown.restart()
      setStep('code')
    }
  }

  const onResend = async () => {
    if (await request(email.trim())) countdown.restart()
  }

  const onComplete = async (code: string) => {
    setVerifying(true)
    setCodeProblem(null)
    try {
      await auth.verifyCode(email.trim(), code)
      await queryClient.invalidateQueries({ queryKey: sessionKey })
      await navigate(safeNext(params.get('next')), { replace: true })
    } catch (error) {
      setCodeProblem(error instanceof ApiFailure && error.problem.code === 'invalid_code' ? 'invalid' : 'failed')
    } finally {
      setVerifying(false)
    }
  }

  if (step === 'code') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-heading-md font-semibold text-ink">{t('login.codeTitle')}</h1>
        <p className="text-body-md text-body">{t('login.neutral')}</p>
        <p className="text-body-sm text-mute">
          {t('login.sentTo')} <span className="font-medium text-ink">{email.trim()}</span>
        </p>
        <OtpInput
          groupLabel={t('login.codeGroup')}
          cellLabel={(i) => t('login.codeCell', { n: i + 1 })}
          onComplete={(code) => void onComplete(code)}
          onChange={() => setCodeProblem(null)}
          invalid={codeProblem === 'invalid'}
          disabled={verifying}
          autoFocus
        />
        {codeProblem && (
          <p role="alert" className="text-body-sm text-critical">
            {codeProblem === 'invalid' ? t('login.codeInvalid') : t('login.verifyFailed')}
          </p>
        )}
        {problem === 'rate_limited' && <InlineNotice tone="warning">{t('login.rateLimited')}</InlineNotice>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {countdown.left > 0 ? (
            <span className="text-body-sm text-mute">{t('login.resendIn', { seconds: countdown.left })}</span>
          ) : (
            <Button variant="ghost" size="sm" loading={sending} onClick={() => void onResend()}>
              {t('login.resend')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep('email')
              setProblem(null)
              setCodeProblem(null)
            }}
          >
            {t('login.useOtherEmail')}
          </Button>
        </div>
        <LegalFooter />
      </div>
    )
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-md font-semibold text-ink">{t('login.title')}</h1>
        <p className="text-body-md text-body">{t('login.subtitle')}</p>
      </div>
      <FormField label={t('login.emailLabel')} error={problem === 'invalid' ? t('login.invalidEmail') : undefined}>
        {(control) => (
          <Input
            {...control}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (problem === 'invalid') setProblem(null)
            }}
            autoFocus
          />
        )}
      </FormField>
      {problem === 'rate_limited' && <InlineNotice tone="warning">{t('login.rateLimited')}</InlineNotice>}
      {problem === 'failed' && <InlineNotice tone="warning">{t('login.sendFailed')}</InlineNotice>}
      <Button type="submit" loading={sending}>
        {t('login.submit')}
      </Button>
      <LegalFooter />
    </form>
  )
}

export { AuthCallbackPage } from './AuthCallbackPage'
