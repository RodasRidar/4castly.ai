import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import type { ProductPage } from '../../services/types'
import { productsKey } from './queries'

type Status = 'saving' | 'error'

/** Per-product lead time: optimistic in every cached page, restored (and reported) if the save fails. */
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
    mutationFn: ({ code, days }: { code: string; days: number }) => runs.setOverrides(code, { lead_time_days: days }),
    onMutate: async ({ code, days }) => {
      await queryClient.cancelQueries({ queryKey: productsKey(runId) })
      const snapshot = queryClient.getQueriesData<ProductPage>({ queryKey: productsKey(runId) })
      queryClient.setQueriesData<ProductPage>({ queryKey: productsKey(runId) }, (page) =>
        page && { ...page, items: page.items.map((p) => (p.code === code ? { ...p, lead_time_days: days, lead_time_overridden: true } : p)) },
      )
      setFor(code, 'saving')
      return { snapshot }
    },
    onError: (_error, { code }, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data))
      setFor(code, 'error')
      notify('error', t('results.table.leadTimeSaveError'))
    },
    onSuccess: (_data, { code }) => setFor(code, null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: productsKey(runId) }),
  })

  return { save: (code: string, days: number) => mutation.mutate({ code, days }), status }
}
