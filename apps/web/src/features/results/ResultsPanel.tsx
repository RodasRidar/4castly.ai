import { useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { Icon } from '../../ui/atoms/Icon'
import { PanelBoundary } from '../../layouts/ErrorBoundary'
import type { ResultsState } from '../shared/resultsUrl'
import { ChartSection } from './ChartSection'
import { FiltersSection } from './FiltersSection'
import { KpiSection } from './KpiSection'
import { Notices } from './Notices'
import { ProductsSection } from './ProductsSection'
import { runKey } from './queries'

interface ResultsPanelProps {
  runId: string
  conversationId: string
  state: ResultsState
  update: (patch: Partial<ResultsState>, options?: { replace?: boolean }) => void
  portfolio: boolean
  selected: string[]
  onSelectedChange: (codes: string[]) => void
  onExportSelection: () => void
  onOpenParameters: () => void
  /** Portfolio view: opens the assistant drawer. */
  onAsk?: () => void
}

/** KPIs, chart, filters and table: the same content in the split view and in the portfolio. */
export function ResultsPanel({
  runId,
  conversationId,
  state,
  update,
  portfolio,
  selected,
  onSelectedChange,
  onExportSelection,
  onOpenParameters,
  onAsk,
}: ResultsPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const retryAll = () => void queryClient.invalidateQueries({ queryKey: runKey(runId) })
  const reset = () => update({ q: '', risk: [], abc: [] })

  return (
    <div className="flex flex-col gap-6">
      <Notices runId={runId} conversationId={conversationId} onChangeParameters={onOpenParameters} />
      <KpiSection runId={runId} state={state} onRetry={retryAll} />
      <PanelBoundary>
        <ChartSection runId={runId} onRetry={retryAll} />
      </PanelBoundary>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FiltersSection runId={runId} state={state} update={update} onReset={reset} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" iconLeft={<Icon icon={SlidersHorizontal} />} onClick={onOpenParameters}>
            {t('results.parameters.button')}
          </Button>
          {onAsk && (
            <Button variant="secondary" onClick={onAsk}>
              {t('results.ask.button')}
            </Button>
          )}
        </div>
      </div>
      <PanelBoundary>
        <ProductsSection
          runId={runId}
          conversationId={conversationId}
          state={state}
          update={update}
          onReset={reset}
          portfolio={portfolio}
          selected={selected}
          onSelectedChange={onSelectedChange}
          onExportSelection={onExportSelection}
        />
      </PanelBoundary>
    </div>
  )
}
