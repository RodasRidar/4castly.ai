import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '../services/servicesContext'

export const sessionKey = ['session'] as const

export function useSession() {
  const { auth } = useServices()
  return useQuery({ queryKey: sessionKey, queryFn: () => auth.getSession(), staleTime: Infinity })
}

export function useSignOut() {
  const { auth } = useServices()
  const queryClient = useQueryClient()
  return async () => {
    await auth.signOut()
    // Drop everything tied to the previous user, then record "no session" so guards redirect.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] })
    queryClient.setQueryData(sessionKey, null)
  }
}
