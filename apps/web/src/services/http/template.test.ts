import { describe, expect, it, vi } from 'vitest'
import { createHttpServices } from '.'

const fakeSupabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } }, error: null }) } } as never

describe('template download', () => {
  it('fetches the template with the session token and falls back to a default file name', async () => {
    const fetchStub = vi.fn(async () => new Response('xlsx'))
    const services = createHttpServices({ apiUrl: 'https://api.example.test', supabase: fakeSupabase, onUnauthorized: () => {}, fetch: fetchStub as never })
    const file = await services.uploads.downloadTemplate()
    expect(await file.blob.text()).toBe('xlsx')
    expect(file.fileName).toBe('plantilla-ventas.xlsx')
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/templates/sales.xlsx')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
  })
})
