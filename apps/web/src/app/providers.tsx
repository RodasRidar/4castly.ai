import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ServicesProvider } from '../services/context'
import { ThemeProvider } from '../theme/ThemeProvider'
import type { AppEnv } from './env'
import { AppEnvContext } from './envContext'

export function AppProviders({ env, children }: { env: AppEnv; children: ReactNode }) {
  // One client per mounted app: tests must not share a cache.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
  )
  return (
    <AppEnvContext value={env}>
      <I18nextProvider i18n={env.i18n}>
        <ThemeProvider store={env.themeStore}>
          <ServicesProvider services={env.services}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </ServicesProvider>
        </ThemeProvider>
      </I18nextProvider>
    </AppEnvContext>
  )
}
