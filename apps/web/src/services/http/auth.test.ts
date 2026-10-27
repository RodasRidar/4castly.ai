import { describe, expect, it, vi } from 'vitest'
import { ApiFailure } from '../types'
import { accessTokenOf, createHttpAuthService, type AuthClient, type AuthErrorLike } from './auth'

function fakeClient(over: Partial<AuthClient['auth']> = {}) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-123' } }, error: null })),
    signInWithOtp: vi.fn(async (_args: { email: string; options?: { shouldCreateUser?: boolean } }) => ({ error: null as AuthErrorLike | null })),
    verifyOtp: vi.fn(async (_args: { email: string; token: string; type: 'email' }) => ({ error: null as AuthErrorLike | null })),
    signOut: vi.fn(async () => ({ error: null as AuthErrorLike | null })),
    ...over,
  }
  return { client: { auth } as AuthClient, auth }
}

const fails = async (promise: Promise<unknown>) => (await promise.then(() => null, (e: unknown) => e)) as ApiFailure

describe('session', () => {
  it('reports a session when Supabase has one', async () => {
    const { client } = fakeClient()
    await expect(createHttpAuthService(client).hasSession()).resolves.toBe(true)
  })

  it('reports no session when there is none or Supabase errors', async () => {
    const none = fakeClient({ getSession: vi.fn(async () => ({ data: { session: null }, error: null })) })
    await expect(createHttpAuthService(none.client).hasSession()).resolves.toBe(false)
    const broken = fakeClient({ getSession: vi.fn(async () => ({ data: { session: null }, error: { message: 'boom' } })) })
    await expect(createHttpAuthService(broken.client).hasSession()).resolves.toBe(false)
  })

  it('reads the access token for the API client', async () => {
    await expect(accessTokenOf(fakeClient().client)).resolves.toBe('tok-123')
    const none = fakeClient({ getSession: vi.fn(async () => ({ data: { session: null }, error: null })) })
    await expect(accessTokenOf(none.client)).resolves.toBeNull()
  })
})

describe('requestCode', () => {
  it('asks Supabase for a code without creating users', async () => {
    const { client, auth } = fakeClient()
    await createHttpAuthService(client).requestCode('  ana@example.com ')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'ana@example.com', options: { shouldCreateUser: false } })
  })

  it.each<[string, AuthErrorLike]>([
    ['otp_disabled', { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' }],
    ['signup_disabled', { message: 'Signups not allowed', status: 400, code: 'signup_disabled' }],
    ['user_not_found', { message: 'User not found', status: 422, code: 'user_not_found' }],
  ])('resolves for an email that is not enabled (%s) so the UI never reveals it', async (_name, error) => {
    const { client } = fakeClient({ signInWithOtp: vi.fn(async () => ({ error })) })
    await expect(createHttpAuthService(client).requestCode('nobody@example.com')).resolves.toBeUndefined()
  })

  it.each<[string, AuthErrorLike]>([
    ['429', { message: 'rate', status: 429 }],
    ['code without status', { message: 'rate', code: 'over_email_send_rate_limit' }],
    ['request limit', { message: 'rate', status: 429, code: 'over_request_rate_limit' }],
  ])('rejects with rate_limited on real rate limiting (%s)', async (_name, error) => {
    const { client } = fakeClient({ signInWithOtp: vi.fn(async () => ({ error })) })
    const failure = await fails(createHttpAuthService(client).requestCode('ana@example.com'))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure.problem).toMatchObject({ status: 429, code: 'rate_limited', message_key: 'errors.rateLimited' })
  })

  it('rejects with a validation failure when Supabase says the email is malformed', async () => {
    const { client } = fakeClient({ signInWithOtp: vi.fn(async () => ({ error: { message: 'bad', status: 400, code: 'validation_failed' } })) })
    const failure = await fails(createHttpAuthService(client).requestCode('x'))
    expect(failure.problem).toMatchObject({ status: 422, code: 'validation_error', message_key: 'errors.validation' })
  })

  it('rejects with a generic failure for server errors and a network failure for no status', async () => {
    const server = fakeClient({ signInWithOtp: vi.fn(async () => ({ error: { message: 'down', status: 500 } })) })
    expect((await fails(createHttpAuthService(server.client).requestCode('a@b.co'))).problem).toMatchObject({ status: 500, code: 'internal_error', message_key: 'errors.internal' })
    const offline = fakeClient({ signInWithOtp: vi.fn(async () => ({ error: { message: 'fetch failed' } })) })
    expect((await fails(createHttpAuthService(offline.client).requestCode('a@b.co'))).problem).toMatchObject({ status: 0, code: 'network_error', message_key: 'errors.network' })
  })
})

describe('verifyCode', () => {
  it('verifies an email code', async () => {
    const { client, auth } = fakeClient()
    await expect(createHttpAuthService(client).verifyCode(' ana@example.com', '123456')).resolves.toBeUndefined()
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' })
  })

  it.each<[string, AuthErrorLike]>([
    ['expired', { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' }],
    ['invalid', { message: 'invalid', status: 400 }],
  ])('rejects with invalid_code for a wrong or expired code (%s)', async (_name, error) => {
    const { client } = fakeClient({ verifyOtp: vi.fn(async () => ({ error })) })
    const failure = await fails(createHttpAuthService(client).verifyCode('ana@example.com', '000000'))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure.problem).toMatchObject({ code: 'invalid_code', message_key: 'errors.invalidCode' })
  })

  it('keeps rate limiting, server and network errors distinct from a wrong code', async () => {
    const limited = fakeClient({ verifyOtp: vi.fn(async () => ({ error: { message: 'rate', status: 429 } })) })
    expect((await fails(createHttpAuthService(limited.client).verifyCode('a@b.co', '1'))).problem.code).toBe('rate_limited')
    const server = fakeClient({ verifyOtp: vi.fn(async () => ({ error: { message: 'down', status: 502 } })) })
    expect((await fails(createHttpAuthService(server.client).verifyCode('a@b.co', '1'))).problem.code).toBe('internal_error')
    const offline = fakeClient({ verifyOtp: vi.fn(async () => ({ error: { message: 'fetch failed' } })) })
    expect((await fails(createHttpAuthService(offline.client).verifyCode('a@b.co', '1'))).problem.code).toBe('network_error')
  })
})

describe('signOut', () => {
  it('signs out of Supabase', async () => {
    const { client, auth } = fakeClient()
    await createHttpAuthService(client).signOut()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('rejects with a generic failure when Supabase cannot sign out', async () => {
    const { client } = fakeClient({ signOut: vi.fn(async () => ({ error: { message: 'down', status: 500 } })) })
    expect((await fails(createHttpAuthService(client).signOut())).problem.code).toBe('internal_error')
  })
})
