import { use, useSyncExternalStore } from 'react'
import { ThemeStoreContext } from './themeStoreContext'
import type { ThemePreference, ThemeStore } from './themeStore'

export function useThemeStore(): ThemeStore {
  const store = use(ThemeStoreContext)
  if (!store) throw new Error('useThemeStore must be used inside <ThemeProvider>')
  return store
}

export function useTheme(): { preference: ThemePreference; setPreference: (p: ThemePreference) => void } {
  const store = useThemeStore()
  const preference = useSyncExternalStore(store.subscribe, store.getPreference)
  return { preference, setPreference: store.setPreference }
}
