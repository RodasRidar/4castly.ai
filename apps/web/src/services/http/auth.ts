import type { AuthService } from '../ports'
import { ApiFailure, type ApiError } from '../types'

/** The slice of Supabase's auth error the mapping needs. */
export interface AuthErrorLike {
  message: string
  status?: number
  code?: string
}

/** Structural subset of `SupabaseClient`, so tests inject a fake and the real client is assignable. */
export interface AuthClient {
  auth: {
    getSession(): Promise<{ data: { session: { access_token: string } | null }; error: AuthErrorLike | null }>
    signInWithOtp(args: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<{ error: AuthErrorLike | null }>
    verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<{ error: AuthErrorLike | null }>
    signOut(): Promise<{ error: AuthErrorLike | null }>
  }
}

const problem = (status: number, code: string, messageKey: string): ApiFailure =>
  new ApiFailure({ type: 'about:blank', title: code, status, code, message_key: messageKey, ref: '' } satisfies ApiError)

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'])
const MALFORMED_CODES = new Set(['validation_failed', 'email_address_invalid'])

const isRateLimited = (e: AuthErrorLike) => e.status === 429 || (e.code !== undefined && RATE_LIMIT_CODES.has(e.code))

/** Failures that say nothing about the user's input: the service is down or unreachable. */
function infrastructure(e: AuthErrorLike): ApiFailure {
  if (e.status === undefined || e.status === 0) return problem(0, 'network_error', 'errors.network')
  return problem(e.status, 'internal_error', 'errors.internal')
}

/** The access token the API client sends as a bearer token, or null without a session. */
export async function accessTokenOf(client: AuthClient): Promise<string | null> {
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? null
}

export function createHttpAuthService(client: AuthClient): AuthService {
  return {
    async hasSession() {
      const { data, error } = await client.auth.getSession()
      return !error && data.session !== null
    },

    async requestCode(email) {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
      if (!error) return
      if (isRateLimited(error)) throw problem(429, 'rate_limited', 'errors.rateLimited')
      if (error.code !== undefined && MALFORMED_CODES.has(error.code)) throw problem(422, 'validation_error', 'errors.validation')
      if (error.status === undefined || error.status === 0 || error.status >= 500) throw infrastructure(error)
      // Any other 4xx (user not found, signups not allowed) must look like success: the UI never reveals
      // whether an email is enabled.
    },

    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
      if (!error) return
      if (isRateLimited(error)) throw problem(429, 'rate_limited', 'errors.rateLimited')
      if (error.status === undefined || error.status === 0 || error.status >= 500) throw infrastructure(error)
      throw problem(400, 'invalid_code', 'errors.invalidCode')
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw infrastructure(error)
    },
  }
}
