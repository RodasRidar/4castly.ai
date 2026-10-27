import type { i18n } from 'i18next'
import type { Services } from '../services/ports'
import type { ThemeStore } from '../theme/themeStore'

/** Everything the app needs from the outside world; main.tsx wires the real ones, tests wire fakes. */
export interface AppEnv {
  services: Services
  i18n: i18n
  themeStore: ThemeStore
  /** Element whose `lang` follows the language preference. */
  root: HTMLElement
  /** Retry failed GETs with backoff (R12). Off in tests so failures show at once. Mutations never retry. */
  retryQueries?: boolean
}
