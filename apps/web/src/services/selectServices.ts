import { announceUnauthorized } from '../app/unauthorized'
import type { AuthClient } from './http/auth'
import { createHttpServices } from './http'
import { createMockServices, type MockOptions, type MockServices } from './mock'
import type { Services } from './ports'

interface ServiceEnv {
  VITE_API_URL?: string
  VITE_USE_MOCK?: string
}

type Selected = { kind: 'http'; services: Services } | { kind: 'mock'; services: MockServices }

/**
 * The real API is used when it is configured; otherwise (or with `VITE_USE_MOCK=1`) the in-memory mocks run,
 * so the app still works offline and in Storybook-style reviews. One decision, made once at startup.
 */
export function selectServices(env: ServiceEnv, supabase: AuthClient | null, mockOptions?: MockOptions): Selected {
  if (env.VITE_API_URL && supabase && env.VITE_USE_MOCK !== '1') {
    return {
      kind: 'http',
      services: createHttpServices({ apiUrl: env.VITE_API_URL, supabase, onUnauthorized: announceUnauthorized }),
    }
  }
  return { kind: 'mock', services: createMockServices(mockOptions) }
}
