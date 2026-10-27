import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useServices } from '../../services/servicesContext'
import type { ResultsState } from '../shared/resultsUrl'
import { withoutStockDependence } from './stockless'

export const runKey = (runId: string) => ['run', runId] as const
export const summaryKey = (runId: string) => [...runKey(runId), 'summary'] as const
export const productsKey = (runId: string) => [...runKey(runId), 'products'] as const

export function useRunSummary(runId: string) {
  const { runs } = useServices()
  return useQuery({ queryKey: summaryKey(runId), queryFn: () => runs.summary(runId) })
}

/** Keeps the previous page on screen while the next one loads, so filtering never flashes skeletons. */
export function useRunProducts(runId: string, state: Pick<ResultsState, 'q' | 'risk' | 'abc' | 'sort' | 'order' | 'page'>) {
  const { runs } = useServices()
  const summary = useRunSummary(runId)
  // Without stock the API refuses the risk filter (422), so the request waits for the summary to know.
  // If the summary itself fails the products are still asked for as they are.
  const stockUnknown = summary.data?.stock_known === false
  const query = stockUnknown ? withoutStockDependence(state) : state
  return useQuery({
    queryKey: [...productsKey(runId), query],
    queryFn: () => runs.products(runId, query),
    placeholderData: keepPreviousData,
    enabled: !summary.isPending,
  })
}
