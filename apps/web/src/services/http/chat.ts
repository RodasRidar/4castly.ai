import type { ChatService } from '../ports'
import type { HttpClient } from './client'

/** Stub: unit B replaces the body. Keep the export name and signature. */
export function createHttpChatService(_client: HttpClient): ChatService {
  throw new Error('createHttpChatService is not implemented yet')
}
