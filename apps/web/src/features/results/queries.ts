import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useServices } from '../../services/servicesContext'
import type { ResultsState } from '../shared/resultsUrl'

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
  return useQuery({
    queryKey: [...productsKey(runId), state],
    queryFn: () => runs.products(runId, state),
    placeholderData: keepPreviousData,
  })
}
