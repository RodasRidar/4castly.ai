import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createI18n } from '../i18n'
import { createMockServices, defaultSeed, type MockSeed } from '../services/mock'
import type { Language } from '../services/ports'
import { createThemeStore } from '../theme/themeStore'
import type { AppEnv } from './env'
import { AppProviders } from './providers'
import { createRoutes } from './routes'

interface RenderAppOptions {
  path?: string
  /** `null` renders an anonymous visitor. */
  user?: MockSeed['user']
  seed?: MockSeed
  language?: Language
  failConversations?: boolean
  failPatch?: boolean
}

/** Mounts the whole app on a memory router with fake services, a private theme store and a detached <html>. */
export function renderApp({ path = '/nuevo', user, seed, language = 'es', failConversations, failPatch }: RenderAppOptions = {}) {
  const base = seed ?? defaultSeed()
  const services = createMockServices(user === undefined ? base : { ...base, user })
  services.failConversations = failConversations ?? false
  services.failPatch = failPatch ?? false

  const root = document.createElement('html')
  const store = new Map<string, string>()
  const themeStore = createThemeStore({
    root,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    matchMedia: window.matchMedia.bind(window),
  })
  const env: AppEnv = { services, i18n: createI18n(language), themeStore, root }
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] })

  const result = render(
    <AppProviders env={env}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...result, router, services, themeStore, root, i18n: env.i18n, user: userEvent.setup() }
}
