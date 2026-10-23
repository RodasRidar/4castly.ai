import { useSyncExternalStore } from 'react'
import { themeStore } from './instance'
import type { ThemePreference } from './themeStore'

export function useTheme(): { preference: ThemePreference; setPreference: (p: ThemePreference) => void } {
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.getPreference)
  return { preference, setPreference: themeStore.setPreference }
}
