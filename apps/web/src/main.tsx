import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import './theme/theme.css'
import { AppProviders } from './app/providers'
import { createRoutes } from './app/routes'
import { createI18n, readStoredLanguage } from './i18n'
import { createMockServices } from './services/mock'
import { themeStore } from './theme/instance'

// Dev-only routes (plan 8.2). The dynamic import keeps them out of the production bundle.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/tokens', lazy: async () => ({ Component: (await import('./dev/TokensPage.tsx')).TokensPage }) }]
  : []

const language = readStoredLanguage()
document.documentElement.lang = language

// Mock services until the http implementation lands (F4 swaps this one line).
const env = { services: createMockServices(), i18n: createI18n(language), themeStore, root: document.documentElement }
const router = createBrowserRouter(createRoutes(devRoutes))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders env={env}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
