import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ServicesProvider } from '../services/context'
import { ApiFailure } from '../services/types'
import { ThemeProvider } from '../theme/ThemeProvider'
import type { AppEnv } from './env'
import { AppEnvContext } from './envContext'
import { UNAUTHORIZED_EVENT } from './unauthorized'
import { sessionKey } from './session'

/** Network errors and 5xx are worth another try; a 4xx answer will not change by asking again. */
function retryTransient(count: number, error: unknown): boolean {
  if (count >= 2) return false
  return !(error instanceof ApiFailure) || error.problem.status === 0 || error.problem.status >= 500
}

export function AppProviders({ env, children }: { env: AppEnv; children: ReactNode }) {
  // One client per mounted app: tests must not share a cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: env.retryQueries ? retryTransient : false,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  )
  // The HTTP layer announces a 401 on `window`; drop the user's data and let the guards redirect to /login.
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] })
      queryClient.setQueryData(sessionKey, null)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [queryClient])

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
