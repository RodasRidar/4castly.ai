import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import { pendingOverridesKey, recordPendingLeadTime, type PendingLeadTimes } from './pendingOverrides'

type Status = 'saving' | 'error'

/**
 * Per-product lead time. The API stores the override but only applies it the next time results are calculated,
 * so the value the user saved is kept as a pending edit (shown over the API row) rather than written into the
 * cached pages, and it is optimistic: restored, and reported, if the save fails.
 */
export function useLeadTimeOverride(runId: string) {
  const { runs } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { t } = useTranslation()
  const [status, setStatus] = useState<Record<string, Status>>({})
  const setFor = (code: string, next: Status | null) =>
    setStatus((prev) => {
      const { [code]: _old, ...rest } = prev
      return next ? { ...rest, [code]: next } : rest
    })

  const mutation = useMutation({
    // The API REPLACES a product's whole override set, so this only ever sends the lead time the UI edits.
    // Contract request: PATCH semantics (or per-field flags) so target coverage / on-order are never wiped.
    mutationFn: ({ code, days }: { code: string; days: number }) => runs.setOverrides(code, { lead_time_days: days }),
    onMutate: ({ code, days }) => {
      const previous = queryClient.getQueryData<PendingLeadTimes>(pendingOverridesKey(runId)) ?? {}
      recordPendingLeadTime(queryClient, runId, code, days)
      setFor(code, 'saving')
      return { previous }
    },
    onError: (_error, { code }, context) => {
      if (context) queryClient.setQueryData(pendingOverridesKey(runId), context.previous)
      setFor(code, 'error')
      notify('error', t('results.table.leadTimeSaveError'))
    },
    onSuccess: (_data, { code }) => setFor(code, null),
  })

  return { save: (code: string, days: number) => mutation.mutate({ code, days }), status }
}
