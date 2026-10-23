import type { ReactNode } from 'react'
import { ThemeStoreContext } from './themeStoreContext'
import type { ThemeStore } from './themeStore'

export function ThemeProvider({ store, children }: { store: ThemeStore; children: ReactNode }) {
  return <ThemeStoreContext value={store}>{children}</ThemeStoreContext>
}
