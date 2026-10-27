import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import './theme/theme.css'
import { AppProviders } from './app/providers'
import { createRoutes } from './app/routes'
import { createI18n, readStoredLanguage } from './i18n'
import { supabase } from './lib/supabase'
import { selectServices } from './services/selectServices'
import { themeStore } from './theme/instance'

// Dev-only routes (plan 8.2). The dynamic import keeps them out of the production bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/tokens', lazy: async () => ({ Component: (await import('./dev/TokensPage.tsx')).TokensPage }) }]
  : []

const language = readStoredLanguage()
document.documentElement.lang = language

// Real API when VITE_API_URL and Supabase are configured; in-memory mocks otherwise (or with VITE_USE_MOCK=1).
// Dev only, mocks only: `?signedout` starts without a session so the login screens can be reviewed.
const signedIn = !(import.meta.env.DEV && new URLSearchParams(location.search).has('signedout'))
const { kind, services } = selectServices(
  { VITE_API_URL: import.meta.env.VITE_API_URL, VITE_USE_MOCK: import.meta.env.VITE_USE_MOCK },
  supabase,
  { signedIn },
)
// Dev only: lets QA flip mock states (sign out, failures, advance jobs) from the console.
if (import.meta.env.DEV && kind === 'mock') Object.assign(window, { __mock: services })
const env = { services, i18n: createI18n(language), themeStore, root: document.documentElement, retryQueries: kind === 'http' }
const router = createBrowserRouter(createRoutes(devRoutes))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders env={env}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
