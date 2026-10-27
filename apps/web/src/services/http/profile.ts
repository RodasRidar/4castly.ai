import type { ProfileService } from '../ports'
import type { Preferences, User } from '../types'
import type { HttpClient } from './client'

export function createHttpProfileService(client: HttpClient): ProfileService {
  return {
    getMe: () => client.json<User>('GET', '/v1/me'),
    updateMe: (patch) => client.json<User>('PATCH', '/v1/me', { body: patch }),
    getPreferences: () => client.json<Preferences>('GET', '/v1/me/preferences'),
    async updatePreferences(patch) {
      // The API replaces the whole object (`PUT`), so a single changed field must travel with the others.
      const current = await client.json<Preferences>('GET', '/v1/me/preferences')
      return client.json<Preferences>('PUT', '/v1/me/preferences', { body: { ...current, ...patch } })
    },
  }
}
