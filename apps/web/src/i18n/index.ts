import i18next, { type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { Language } from '../services/ports'
import { en } from './locales/en'
import { es } from './locales/es'

export const DEFAULT_LANGUAGE: Language = 'es'
export const LANGUAGES: Language[] = ['es', 'en']
export const LANGUAGE_STORAGE_KEY = '4castly.language'

export function isLanguage(value: unknown): value is Language {
  return value === 'es' || value === 'en'
}

/** Last language the user chose on this device, so the first paint matches before preferences load. */
export function readStoredLanguage(storage: Pick<Storage, 'getItem'> = window.localStorage): Language {
  try {
    const stored = storage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Storage can be blocked; use the default.
  }
  return DEFAULT_LANGUAGE
}

/** Builds an isolated instance (tests) or the app singleton. Spanish is the default and the fallback. */
export function createI18n(language: Language = DEFAULT_LANGUAGE): i18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    resources: { es: { translation: es }, en: { translation: en } },
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  })
  return instance
}

/** Applies the language to the instance, the document and the device cache. */
export function applyLanguage(instance: i18n, language: Language, root: HTMLElement = document.documentElement) {
  void instance.changeLanguage(language)
  root.lang = language
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Not persisted; the in-memory choice still applies.
  }
}
