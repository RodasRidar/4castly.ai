import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { recordPendingLeadTime } from '../results/pendingOverrides'
import { useServices } from '../../services/servicesContext'
import type { SimulationRequest } from '../../services/types'
import { triggerDownload } from './download'
import { errorRef } from './errorRef'

/** Debounce before a what-if edit hits the API. A mutable seam so tests do not wait 300 ms per edit. */
export const simulationConfig = { debounceMs: 300 }

/** Everything about one run lives under ['run', runId], so one invalidation refreshes every view of it. */
export const runKey = (runId: string) => ['run', runId] as const
export const productKey = (runId: string, code: string) => ['run', runId, 'product', code] as const

export function useProductDetail(runId: string, code: string) {
  const { runs } = useServices()
  return useQuery({ queryKey: productKey(runId, code), queryFn: () => runs.product(runId, code) })
}

export function useDebouncedValue<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), simulationConfig.debounceMs)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}

/** What-if for lead time, coverage and the purchase toggle. Only runs when an input differs from the saved one. */
export function useSimulation(runId: string, code: string, request: SimulationRequest, enabled: boolean) {
  const { runs } = useServices()
  return useQuery({
    queryKey: ['run', runId, 'simulation', code, request.lead_time_days, request.target_coverage_weeks, request.with_purchase],
    queryFn: () => runs.simulate(runId, code, request),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useSaveLeadTime(runId: string, code: string, productName: string) {
  const { runs } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { t } = useTranslation()
  return useMutation({
    // The API REPLACES the product's whole override set, so only the lead time this page edits is sent.
    // Contract request: PATCH semantics so target coverage / on-order overrides are never wiped.
    mutationFn: (leadTimeDays: number) => runs.setOverrides(code, { lead_time_days: leadTimeDays }),
    // Stored, not applied: the API row keeps the old value until the next calculation, so remember the saved one.
    onSuccess: (_data, leadTimeDays) => {
      recordPendingLeadTime(queryClient, runId, code, leadTimeDays)
      notify('success', t('product.purchase.saved', { name: productName }))
    },
    onError: (error) => notify('error', t('product.purchase.saveError', { ref: errorRef(error) })),
  })
}

export function useExportProduct(runId: string, code: string) {
  const { runs } = useServices()
  const notify = useNotify()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: () => runs.createExport(runId, { format: 'xlsx', scope: 'product', codes: [code] }),
    onSuccess: (file) => {
      triggerDownload(file.download_url, file.file_name)
      notify('success', t('product.export.done', { file: file.file_name }))
    },
    onError: (error) => notify('error', t('product.export.error', { ref: errorRef(error) })),
  })
}
