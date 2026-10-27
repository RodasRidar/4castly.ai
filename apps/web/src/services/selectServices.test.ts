import { describe, expect, it } from 'vitest'
import { selectServices } from './selectServices'

const supabase = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } } as never

describe('selectServices', () => {
  it('uses the real API when the API URL and Supabase are configured', () => {
    const { kind } = selectServices({ VITE_API_URL: 'https://api.example.test' }, supabase)
    expect(kind).toBe('http')
  })

  it.each([
    ['no API URL', {}, supabase],
    ['an empty API URL', { VITE_API_URL: '' }, supabase],
    ['no Supabase client', { VITE_API_URL: 'https://api.example.test' }, null],
  ])('falls back to mocks with %s', (_name, env, client) => {
    expect(selectServices(env, client).kind).toBe('mock')
  })

  it('lets VITE_USE_MOCK force the mocks even when everything is configured', () => {
    const { kind } = selectServices({ VITE_API_URL: 'https://api.example.test', VITE_USE_MOCK: '1' }, supabase)
    expect(kind).toBe('mock')
  })

  it('passes the mock options through', async () => {
    const { services } = selectServices({}, null, { signedIn: false })
    expect(await services.auth.hasSession()).toBe(false)
  })
})
