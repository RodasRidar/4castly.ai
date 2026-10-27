import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { ProductRow } from '../../services/types'

/**
 * Lead times the user saved that the API has stored but not applied yet: it applies per-product overrides the next
 * time results are calculated. They live in the query cache (not component state) so the table, the product page
 * and the notices all see the same list and it survives navigating between them.
 */
export type PendingLeadTimes = Record<string, number>

export const pendingOverridesKey = (runId: string) => ['pending-overrides', runId] as const

const read = (queryClient: QueryClient, runId: string) =>
  queryClient.getQueryData<PendingLeadTimes>(pendingOverridesKey(runId)) ?? {}

export function usePendingLeadTimes(runId: string): PendingLeadTimes {
  return useQuery<PendingLeadTimes>({
    queryKey: pendingOverridesKey(runId),
    queryFn: () => ({}),
    initialData: {},
    staleTime: Infinity,
    gcTime: Infinity,
  }).data
}

export function recordPendingLeadTime(queryClient: QueryClient, runId: string, code: string, days: number) {
  queryClient.setQueryData<PendingLeadTimes>(pendingOverridesKey(runId), { ...read(queryClient, runId), [code]: days })
}

export function clearPendingLeadTimes(queryClient: QueryClient, runId: string) {
  queryClient.setQueryData<PendingLeadTimes>(pendingOverridesKey(runId), {})
}

/** What the table shows: the API row, with the user's saved-but-not-yet-applied lead time on top. */
export function overlayPending(items: ProductRow[], pending: PendingLeadTimes): ProductRow[] {
  return items.map((p) => (p.code in pending ? { ...p, lead_time_days: pending[p.code], lead_time_overridden: true } : p))
}

/** Drops pending entries the API row already reports as applied (the calculation finished). */
export function prunePending(queryClient: QueryClient, runId: string, items: ProductRow[]) {
  const pending = read(queryClient, runId)
  const applied = items.filter((p) => p.code in pending && p.lead_time_overridden && p.lead_time_days === pending[p.code])
  if (applied.length === 0) return
  const next = { ...pending }
  for (const p of applied) delete next[p.code]
  queryClient.setQueryData<PendingLeadTimes>(pendingOverridesKey(runId), next)
}
