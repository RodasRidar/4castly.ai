import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '../services/servicesContext'

export const sessionKey = ['session'] as const

/** The signed-in user, or null. Guards read this one query. */
export function useSession() {
  const { auth, profile } = useServices()
  return useQuery({
    queryKey: sessionKey,
    queryFn: async () => ((await auth.hasSession()) ? profile.getMe() : null),
    staleTime: Infinity,
  })
}

export function useSignOut() {
  const { auth } = useServices()
  const queryClient = useQueryClient()
  return async () => {
    // If the identity provider cannot be reached the local session is dropped anyway: the user asked to leave.
    await auth.signOut().catch(() => undefined)
    // Drop everything tied to the previous user, then record "no session" so guards redirect.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] })
    queryClient.setQueryData(sessionKey, null)
  }
}
