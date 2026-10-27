import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AbcClass, RiskLevel } from '../../services/types'
import { ResultsFilters } from '../../ui/organisms/ResultsFilters'
import type { ResultsState } from '../shared/resultsUrl'
import { useRunProducts, useRunSummary } from './queries'

const SEARCH_DEBOUNCE_MS = 250

interface FiltersSectionProps {
  runId: string
  state: ResultsState
  update: (patch: Partial<ResultsState>, options?: { replace?: boolean }) => void
  onReset: () => void
}

export function FiltersSection({ runId, state, update, onReset }: FiltersSectionProps) {
  const { t } = useTranslation()
  const products = useRunProducts(runId, state)
  const stockKnown = useRunSummary(runId).data?.stock_known !== false

  // Typing is local and debounced into the URL (replace, so Back is not flooded). An external change of `q`
  // (reset, KPI link, shared URL) wins: it is adopted during render, not in an effect.
  const [text, setText] = useState(state.q)
  const [seenQ, setSeenQ] = useState(state.q)
  if (state.q !== seenQ) {
    setSeenQ(state.q)
    setText(state.q)
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onSearch = (value: string) => {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => update({ q: value.trim() }, { replace: true }), SEARCH_DEBOUNCE_MS)
  }

  const focused = !!state.q || (stockKnown && state.risk.length > 0) || state.abc.length > 0
  const page = products.data

  return (
    <ResultsFilters
      groupLabel={t('results.filters.group')}
      search={{
        value: text,
        onValueChange: onSearch,
        label: t('results.filters.search'),
        placeholder: t('results.filters.searchPlaceholder'),
        clearLabel: t('results.filters.clearSearch'),
      }}
      risk={stockKnown ? {
        label: t('results.filters.risk'),
        options: [
          { value: '', label: t('results.filters.allRisks') },
          ...(['critical', 'medium', 'optimal'] as const).map((value) => ({ value, label: t(`results.risk.${value}`) })),
        ],
        value: state.risk.length === 1 ? state.risk[0] : '',
        onValueChange: (value) => update({ risk: value ? [value as RiskLevel] : [] }),
      } : undefined}
      abc={{
        label: t('results.filters.abc'),
        options: [{ value: '', label: t('results.filters.allClasses') }, ...(['A', 'B', 'C'] as const).map((value) => ({ value, label: value }))],
        value: state.abc.length === 1 ? state.abc[0] : '',
        onValueChange: (value) => update({ abc: value ? [value as AbcClass] : [] }),
      }}
      focus={
        focused && page
          ? {
              countText: t('results.filters.focus', { shown: page.total, total: page.total_unfiltered }),
              resetLabel: t('results.filters.reset'),
              onReset,
            }
          : undefined
      }
    />
  )
}
