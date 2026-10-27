import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ApiFailure, type ApiError } from '../services/types'

/**
 * Human copy for an API problem. The `message_key` is the contract (`errors.*`); the UI never shows codes or
 * raw keys, only the short support reference when the backend sent one.
 */
export function errorText(t: TFunction, problem: Pick<ApiError, 'message_key' | 'ref'>): string {
  const known = problem.message_key.startsWith('errors.') && t(problem.message_key, { defaultValue: '' }) !== ''
  const base = known ? t(problem.message_key) : t('errors.generic')
  return problem.ref ? `${base} ${t('errors.reference', { ref: problem.ref })}` : base
}

/** Same, for anything caught: an `ApiFailure` keeps its key, any other error is a generic failure. */
export function errorTextOf(t: TFunction, error: unknown): string {
  return error instanceof ApiFailure ? errorText(t, error.problem) : t('errors.generic')
}

export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => errorTextOf(t, error)
}
