import { createContext, use } from 'react'
import type { AppEnv } from './env'

export const AppEnvContext = createContext<AppEnv | null>(null)

export function useAppEnv(): AppEnv {
  const env = use(AppEnvContext)
  if (!env) throw new Error('useAppEnv must be used inside <AppProviders>')
  return env
}
