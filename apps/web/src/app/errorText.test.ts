import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n'
import { ApiFailure, type ApiError } from '../services/types'
import { errorText, errorTextOf } from './errorText'

const problem = (message_key: string, extra: Partial<ApiError> = {}): ApiError => ({
  type: 'about:blank',
  title: 't',
  status: 500,
  code: 'x',
  message_key,
  ref: '',
  ...extra,
})

describe('errorText', () => {
  it('turns a known message_key into plain Spanish with no internal codes', () => {
    const { t } = createI18n('es')
    expect(errorText(t, problem('errors.notFound'))).toBe('No encontramos lo que buscabas.')
    expect(errorText(t, problem('errors.rateLimited'))).toMatch(/demasiadas solicitudes/)
  })

  it('appends the short support reference when there is one', () => {
    const { t } = createI18n('es')
    expect(errorText(t, problem('errors.internal', { ref: 'K7Q2WX' }))).toMatch(/Referencia: K7Q2WX$/)
    expect(errorText(t, problem('errors.internal'))).not.toMatch(/Referencia/)
  })

  it('answers in English when the language is English', () => {
    const { t } = createI18n('en')
    expect(errorText(t, problem('errors.notFound', { ref: 'ABC123' }))).toBe("We couldn't find what you were looking for. Reference: ABC123")
  })

  it('falls back to a generic message for keys it does not know, never showing the key', () => {
    const { t } = createI18n('es')
    const text = errorText(t, problem('errors.somethingNew'))
    expect(text).toBe('Algo salió mal. Inténtalo de nuevo.')
    expect(text).not.toMatch(/errors\./)
    expect(errorText(t, problem('weird'))).toBe('Algo salió mal. Inténtalo de nuevo.')
  })

  it('covers every key the API and the client can send in both languages', () => {
    const keys = [
      'assistant', 'assistantRefusal', 'assistantUnavailable', 'conflict', 'fileTooLarge', 'fileTypeMismatch', 'forbidden',
      'forecastNotStartable', 'generic', 'granularityUnsupported', 'idempotencyKeyReused', 'internal', 'invalidCursor',
      'jobFinished', 'json', 'methodNotAllowed', 'noResultsYet', 'notFound', 'payloadTooLarge', 'planColumnUnknown',
      'planIncomplete', 'planLocked', 'planNotApplicable', 'rateLimited', 'retryNotLatest', 'runSuperseded', 'stockUnknown', 'timeout',
      'unauthenticated', 'unavailable', 'uploadAlreadyCompleted', 'uploadMissing', 'validation', 'network', 'invalidCode',
    ]
    for (const language of ['es', 'en'] as const) {
      const { t, exists } = createI18n(language)
      for (const key of keys) expect(exists(`errors.${key}`), `${language} errors.${key}`).toBe(true)
      expect(t('errors.generic')).not.toBe('errors.generic')
    }
  })
})

describe('errorTextOf', () => {
  it('reads the problem from an ApiFailure and treats any other error as generic', () => {
    const { t } = createI18n('es')
    expect(errorTextOf(t, new ApiFailure(problem('errors.timeout')))).toMatch(/tardó demasiado/)
    expect(errorTextOf(t, new Error('boom'))).toBe('Algo salió mal. Inténtalo de nuevo.')
    expect(errorTextOf(t, undefined)).toBe('Algo salió mal. Inténtalo de nuevo.')
  })
})
