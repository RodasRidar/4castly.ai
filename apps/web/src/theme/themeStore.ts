export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = '4castly.theme'

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

interface ThemeStoreDeps {
  root: HTMLElement
  storage: Pick<Storage, 'getItem' | 'setItem'>
  matchMedia: (query: string) => MediaQueryList
}

export function createThemeStore({ root, storage, matchMedia }: ThemeStoreDeps) {
  const media = matchMedia('(prefers-color-scheme: dark)')
  const listeners = new Set<() => void>()

  let preference: ThemePreference = 'system'
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY)
    if (isPreference(stored)) preference = stored
  } catch {
    // Storage can be blocked (private mode); fall back to the OS preference.
  }

  const apply = () => {
    root.dataset.theme = resolveTheme(preference, media.matches)
  }

  media.addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  apply()

  return {
    getPreference: () => preference,
    getResolved: (): ResolvedTheme => resolveTheme(preference, media.matches),
    setPreference(next: ThemePreference) {
      preference = next
      try {
        storage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Not persisted; the in-memory choice still applies for this session.
      }
      apply()
      listeners.forEach((fn) => fn())
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export type ThemeStore = ReturnType<typeof createThemeStore>
