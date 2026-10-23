/**
 * Service ports used by containers. F3 only needs the shell slice (session, conversation list, preferences);
 * the rest of section 8 arrives with F4-F5. Hand-written until schema.gen.ts is merged into dev, with the
 * names the generated models will use.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type Language = 'es' | 'en'

export interface User {
  id: string
  name: string
  email: string
  company: string
}

export interface Preferences {
  theme: ThemePreference
  language: Language
  timezone: string
}

export interface Conversation {
  id: string
  title: string
  pinned: boolean
  /** Contract request: `status` and a timestamp for grouping are not in the contract yet. */
  status?: 'processing' | 'failed'
  updatedAt: string
}

export interface AuthService {
  /** Resolves the signed-in user or null. Never rejects for "not signed in". */
  getSession(): Promise<User | null>
  signOut(): Promise<void>
}

export interface ConversationService {
  list(): Promise<Conversation[]>
  setPinned(id: string, pinned: boolean): Promise<void>
  rename(id: string, title: string): Promise<void>
  archive(id: string): Promise<void>
  remove(id: string): Promise<void>
}

export interface ProfileService {
  getPreferences(): Promise<Preferences>
  patchPreferences(patch: Partial<Preferences>): Promise<Preferences>
}

export interface Services {
  auth: AuthService
  conversations: ConversationService
  profile: ProfileService
}
