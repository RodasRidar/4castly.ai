import type { ChatService, RunService, Services } from '../ports'
import { accessTokenOf, createHttpAuthService, type AuthClient } from './auth'
import { createHttpChatService } from './chat'
import { createHttpClient, type HttpClient } from './client'
import { createHttpConversationService } from './conversations'
import { createHttpJobService } from './jobs'
import { createHttpProfileService } from './profile'
import { createHttpRunService } from './runs'
import { createHttpUploadService } from './uploads'

export interface HttpServicesConfig {
  /** API origin (`VITE_API_URL`). */
  apiUrl: string
  /** The Supabase client (or a fake): it owns the session and refreshes the token. */
  supabase: AuthClient
  /** Called once per 401, for example to drop the cached session and go to /login. */
  onUnauthorized?: () => void
  fetch?: typeof fetch
  createXhr?: () => XMLHttpRequest
  /** Replace the run or chat implementation (tests). */
  overrides?: {
    runs?: (client: HttpClient) => RunService
    chat?: (client: HttpClient) => ChatService
  }
}

/**
 * The real services, one object with the same shape as the mocks. Runs and chat are built on first use,
 * so a screen that never opens them pays nothing.
 */
export function createHttpServices(config: HttpServicesConfig): Services {
  const client = createHttpClient({
    baseUrl: config.apiUrl,
    getToken: () => accessTokenOf(config.supabase),
    onUnauthorized: config.onUnauthorized,
    fetch: config.fetch,
  })
  let runs: RunService | undefined
  let chat: ChatService | undefined

  return {
    auth: createHttpAuthService(config.supabase),
    profile: createHttpProfileService(client),
    conversations: createHttpConversationService(client),
    uploads: createHttpUploadService(client, config.apiUrl, { createXhr: config.createXhr }),
    jobs: createHttpJobService(client),
    get runs() {
      return (runs ??= (config.overrides?.runs ?? createHttpRunService)(client))
    },
    get chat() {
      return (chat ??= (config.overrides?.chat ?? createHttpChatService)(client))
    },
  }
}
