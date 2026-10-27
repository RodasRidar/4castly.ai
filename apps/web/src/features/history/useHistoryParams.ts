import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** The history view lives in the URL: `?q=` for the search and `?archivadas=1` for archived conversations. */
export function useHistoryParams() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const archived = params.get('archivadas') === '1'

  const update = useCallback(
    (patch: { q?: string; archived?: boolean }, options?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (patch.q !== undefined) {
            if (patch.q) next.set('q', patch.q)
            else next.delete('q')
          }
          if (patch.archived !== undefined) {
            if (patch.archived) next.set('archivadas', '1')
            else next.delete('archivadas')
          }
          return next
        },
        { replace: options?.replace },
      )
    },
    [setParams],
  )

  return { q, archived, update }
}
