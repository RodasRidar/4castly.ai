import { createContext } from 'react'
import type { ThemeStore } from './themeStore'

export const ThemeStoreContext = createContext<ThemeStore | null>(null)
