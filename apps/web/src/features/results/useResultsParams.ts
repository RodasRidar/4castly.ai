import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { parseResultsParams, resultsSearch, type ResultsState } from '../shared/resultsUrl'

const RESETS_PAGE: (keyof ResultsState)[] = ['q', 'risk', 'abc', 'sort', 'order']

export function useResultsParams() {
  const [params, setParams] = useSearchParams()
  const parsed = useMemo(() => parseResultsParams(params), [params])
  // The portfolio is the "suggested purchase plan": soonest purchase first, unless the user chose an order.
  const state = useMemo<ResultsState>(
    () => (parsed.view === 'portfolio' && !params.has('orden') ? { ...parsed, sort: 'buy_before', order: 'asc' } : parsed),
    [parsed, params],
  )

  const update = useCallback(
    (patch: Partial<ResultsState>, options?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const current = parseResultsParams(prev)
          const next = { ...current, ...patch }
          if (RESETS_PAGE.some((key) => key in patch)) next.page = patch.page ?? 1
          // A portfolio view with the default order has no `orden`: keep it that way unless the order was changed.
          return new URLSearchParams(resultsSearch(next))
        },
        { replace: options?.replace },
      )
    },
    [setParams],
  )

  return { state, update }
}
