import type { ConversationService } from '../ports'
import type { Conversation, ConversationDetail, JobAccepted, PlanView } from '../types'
import type { HttpClient } from './client'

interface ConversationPage {
  items: Conversation[]
  next_cursor: string | null
}

/** The API caps `limit` at 100; the sidebar shows the newest page. */
const SIDEBAR_LIMIT = 100

const path = (id: string, suffix = '') => `/v1/conversations/${encodeURIComponent(id)}${suffix}`

export function createHttpConversationService(client: HttpClient): ConversationService {
  return {
    async list() {
      const page = await client.json<ConversationPage>('GET', '/v1/conversations', { query: { limit: SIDEBAR_LIMIT } })
      return page.items
    },
    async search({ q, includeArchived, cursor, limit } = {}) {
      const page = await client.json<ConversationPage>('GET', '/v1/conversations', {
        query: { q: q || undefined, include_archived: includeArchived, cursor, limit },
      })
      return { items: page.items, nextCursor: page.next_cursor }
    },
    get: (id) => client.json<ConversationDetail>('GET', path(id)),
    update: (id, patch) => client.json<Conversation>('PATCH', path(id), { body: patch }),
    remove: (id) => client.json<void>('DELETE', path(id)),
    restore: (id) => client.json<Conversation>('POST', path(id, '/restore')),
    getPlan: (id) => client.json<PlanView>('GET', path(id, '/plan')),
    confirmPlan: (id, confirmation) => client.json<PlanView>('PUT', path(id, '/plan'), { body: confirmation }),
    // A new key per call: retrying a failed forecast must start a new job, not replay the old response.
    startForecast: (id, request) =>
      client.json<JobAccepted>('POST', path(id, '/forecast'), { body: request, headers: { 'Idempotency-Key': crypto.randomUUID() } }),
  }
}
