import type { Conversation, Preferences, Services, User } from '../ports'

/** Test and story switches to exercise error states. */
export interface MockServices extends Services {
  failConversations: boolean
  failPatch: boolean
}

export interface MockSeed {
  user: User | null
  conversations: Conversation[]
  preferences: Preferences
}

const DAY = 86_400_000

export function defaultSeed(now = Date.now()): MockSeed {
  const ago = (days: number) => new Date(now - days * DAY).toISOString()
  return {
    user: { id: 'u1', name: 'Marta Quispe', email: 'marta@importadora.example', company: 'Importadora Andina' },
    conversations: [
      { id: 'c1', title: 'Pronóstico Kardex marzo', pinned: true, updatedAt: ago(0) },
      { id: 'c2', title: 'Solventes Q2', pinned: false, status: 'processing', updatedAt: ago(0) },
      { id: 'c3', title: 'Reactivos importados', pinned: false, updatedAt: ago(3) },
      { id: 'c4', title: 'Envases 2025', pinned: false, status: 'failed', updatedAt: ago(40) },
    ],
    preferences: { theme: 'system', language: 'es', timezone: 'America/Lima' },
  }
}

/** In-memory services implementing the ports. `latencyMs` lets stories and tests exercise loading states. */
export function createMockServices(seed: MockSeed = defaultSeed(), latencyMs = 0): MockServices {
  let user = seed.user
  let conversations = [...seed.conversations]
  let preferences = { ...seed.preferences }
  const wait = () => (latencyMs > 0 ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve())

  const mock: MockServices = {
    failConversations: false,
    failPatch: false,
    auth: {
      async getSession() {
        await wait()
        return user
      },
      async signOut() {
        await wait()
        user = null
      },
    },
    conversations: {
      async list() {
        await wait()
        if (mock.failConversations) throw new Error('conversations unavailable')
        return conversations
      },
      async setPinned(id, pinned) {
        await wait()
        conversations = conversations.map((c) => (c.id === id ? { ...c, pinned } : c))
      },
      async rename(id, title) {
        await wait()
        conversations = conversations.map((c) => (c.id === id ? { ...c, title } : c))
      },
      async archive(id) {
        await wait()
        conversations = conversations.filter((c) => c.id !== id)
      },
      async remove(id) {
        await wait()
        conversations = conversations.filter((c) => c.id !== id)
      },
    },
    profile: {
      async getPreferences() {
        await wait()
        return preferences
      },
      async patchPreferences(patch) {
        await wait()
        if (mock.failPatch) throw new Error('preferences unavailable')
        preferences = { ...preferences, ...patch }
        return preferences
      },
    },
  }
  return mock
}
