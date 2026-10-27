import { ApiFailure, type ApiError } from '../types'

export interface HttpClientConfig {
  /** API origin, for example `https://api.example.com`. A trailing slash is ignored. */
  baseUrl: string
  /** Supabase access token, or null when there is no session. */
  getToken: () => Promise<string | null>
  /** Called once for every 401, before the failure is thrown (the app signs out and redirects). */
  onUnauthorized?: () => void
  /** Injected in tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch
}

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[]

export interface RequestOptions {
  query?: Record<string, QueryValue>
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface HttpClient {
  /** JSON request. 204 resolves to `undefined`. Rejects with `ApiFailure` (never a raw TypeError). */
  json<T>(method: string, path: string, options?: RequestOptions): Promise<T>
  /** For server-sent events: returns the live response once it is known to be a success. */
  stream(method: string, path: string, options?: RequestOptions): Promise<Response>
}

function problemFor(status: number, code: string, messageKey: string): ApiError {
  return { type: 'about:blank', title: code, status, code, message_key: messageKey, ref: '' }
}

function buildUrl(baseUrl: string, path: string, query: RequestOptions['query']): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)))
    else url.searchParams.set(key, String(value))
  }
  return url.toString()
}

/** Reads the problem+json body the API sends for every error; anything else becomes a generic failure. */
async function failureFrom(response: Response): Promise<ApiFailure> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'code' in body && 'message_key' in body) {
      const problem = body as ApiError
      return new ApiFailure({ ...problem, ref: problem.ref ?? '', status: response.status })
    }
  } catch {
    // Not JSON (a gateway page, for example): fall through to the generic failure.
  }
  return new ApiFailure(problemFor(response.status, 'http_error', 'errors.internal'))
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function send(method: string, path: string, accept: string, options: RequestOptions): Promise<Response> {
    const headers = new Headers({ Accept: accept, ...options.headers })
    const token = await config.getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')

    let response: Response
    try {
      response = await doFetch(buildUrl(config.baseUrl, path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiFailure(problemFor(0, 'network_error', 'errors.network'))
    }

    if (!response.ok) {
      if (response.status === 401) config.onUnauthorized?.()
      throw await failureFrom(response)
    }
    return response
  }

  return {
    async json<T>(method: string, path: string, options: RequestOptions = {}) {
      const response = await send(method, path, 'application/json', options)
      if (response.status === 204) return undefined as T
      return (await response.json()) as T
    },
    stream: (method, path, options = {}) => send(method, path, 'text/event-stream', options),
  }
}
