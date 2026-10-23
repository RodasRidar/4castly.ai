import { describe, expect, it } from 'vitest'
import { applyLanguage, createI18n, LANGUAGE_STORAGE_KEY, readStoredLanguage } from '.'

describe('i18n', () => {
  it('defaults to Spanish and switches to English', async () => {
    const i18n = createI18n()
    expect(i18n.t('nav.newForecast')).toBe('Nuevo pronóstico')
    await i18n.changeLanguage('en')
    expect(i18n.t('nav.newForecast')).toBe('New forecast')
  })

  it('applyLanguage updates the instance, the document language and the device cache', () => {
    const i18n = createI18n()
    const root = document.createElement('html')
    localStorage.clear()
    applyLanguage(i18n, 'en', root)
    expect(i18n.language).toBe('en')
    expect(root.lang).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('reads only valid stored languages', () => {
    expect(readStoredLanguage({ getItem: () => 'en' })).toBe('en')
    expect(readStoredLanguage({ getItem: () => 'fr' })).toBe('es')
    expect(
      readStoredLanguage({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('es')
  })
})
