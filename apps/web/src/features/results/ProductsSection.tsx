import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '../../ui/atoms/Button'
import { BulkActionBar } from '../../ui/organisms/BulkActionBar'
import { ProductTable, type ProductColumnId, type ProductTableLabels } from '../../ui/organisms/ProductTable'
import type { ResultsState } from '../shared/resultsUrl'
import { COLUMN_TO_SORT, SORT_TO_COLUMN, toTableRow } from './format'
import { overlayPending, prunePending, usePendingLeadTimes } from './pendingOverrides'
import { useLeadTimeOverride } from './useLeadTimeOverride'
import { useRunProducts, useRunSummary } from './queries'

interface ProductsSectionProps {
  runId: string
  conversationId: string
  state: ResultsState
  update: (patch: Partial<ResultsState>) => void
  onReset: () => void
  /** Portfolio view: purchase columns, lead-time editing and multi-select. */
  portfolio: boolean
  selected: string[]
  onSelectedChange: (codes: string[]) => void
  onExportSelection: () => void
}

export function ProductsSection({
  runId,
  conversationId,
  state,
  update,
  onReset,
  portfolio,
  selected,
  onSelectedChange,
  onExportSelection,
}: ProductsSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const summary = useRunSummary(runId)
  const products = useRunProducts(runId, state)
  const overrides = useLeadTimeOverride(runId)
  const queryClient = useQueryClient()
  const pending = usePendingLeadTimes(runId)

  const page = products.data
  // Once a calculation has applied a saved lead time, the API row reports it and the local copy is dropped.
  useEffect(() => {
    if (page) prunePending(queryClient, runId, page.items)
  }, [page, queryClient, runId])
  // Products can arrive before the summary; the run's own "today" replaces this fallback as soon as it loads.
  const [fallbackToday] = useState(() => new Date().toISOString().slice(0, 10))
  const today = summary.data?.today ?? fallbackToday
  const rows = overlayPending(page?.items ?? [], pending).map((p) =>
    toTableRow(p, { today, riskLabel: (level) => t(`results.risk.${level}`), leadTimeStatus: overrides.status[p.code] }),
  )
  const pages = page ? Math.max(1, Math.ceil(page.total / page.page_size)) : 1

  const labels: ProductTableLabels = {
    caption: t('results.table.caption'),
    columns: {
      name: t('results.table.columns.name'),
      abc: t('results.table.columns.abc'),
      demand: t('results.table.columns.demand'),
      stock: t('results.table.columns.stock'),
      coverage: t('results.table.columns.coverage'),
      risk: t('results.table.columns.risk'),
      suggested: t('results.table.columns.suggested'),
      buyBefore: t('results.table.columns.buyBefore'),
      leadTime: t('results.table.columns.leadTime'),
    },
    units: {
      demand: t('results.table.units.demand'),
      stock: t('results.table.units.stock'),
      coverage: t('results.table.units.coverage'),
      suggested: t('results.table.units.suggested'),
      leadTime: t('results.table.units.leadTime'),
    },
    sortBy: (column) => t('results.table.sortBy', { column }),
    selectAll: t('results.table.selectAll'),
    selectRow: (name) => t('results.table.selectRow', { name }),
    columnPicker: t('results.table.columnPicker'),
    columnPickerLabel: t('results.table.columnPickerLabel'),
    editLeadTime: (name) => t('results.table.editLeadTime', { name }),
    leadTimeInput: (name) => t('results.table.leadTimeInput', { name }),
    savingText: t('results.table.saving'),
    errorText: t('results.table.saveFailed'),
    loading: t('results.table.loading'),
    empty: {
      title: t('results.table.emptyTitle'),
      body: t('results.table.emptyBody'),
      action: <Button variant="secondary" onClick={onReset}>{t('results.table.emptyAction')}</Button>,
    },
    error: {
      title: t('results.table.errorTitle'),
      body: t('results.table.errorBody'),
      action: <Button variant="secondary" onClick={() => void products.refetch()}>{t('results.table.errorAction')}</Button>,
    },
  }

  const onSortChange = (column: ProductColumnId) => {
    const sort = COLUMN_TO_SORT[column]
    update({ sort, order: state.sort === sort && state.order === 'asc' ? 'desc' : 'asc' })
  }

  return (
    <section className="flex flex-col gap-3">
      {portfolio && <h2 className="text-heading-md font-semibold text-ink">{t('results.table.portfolioTitle')}</h2>}
      <ProductTable
        state={products.isError ? 'error' : products.isPending ? 'loading' : rows.length === 0 ? 'empty' : 'populated'}
        mode={portfolio ? 'portfolio' : 'results'}
        rows={rows}
        labels={labels}
        sort={{ column: SORT_TO_COLUMN[state.sort], direction: state.order }}
        onSortChange={onSortChange}
        onOpenProduct={(code) => void navigate(`/c/${conversationId}/productos/${code}`)}
        selectedCodes={portfolio ? selected : undefined}
        onSelectionChange={portfolio ? onSelectedChange : undefined}
        onLeadTimeChange={portfolio ? overrides.save : undefined}
        pagination={
          pages > 1
            ? {
                page: state.page,
                total: pages,
                pageText: t('results.pagination.page', { page: state.page, total: pages }),
                label: t('results.pagination.label'),
                prevLabel: t('results.pagination.prev'),
                nextLabel: t('results.pagination.next'),
                onPageChange: (next) => update({ page: next }),
              }
            : undefined
        }
      />
      {portfolio && (
        <BulkActionBar
          count={selected.length}
          label={t('results.bulk.label')}
          countText={t('results.bulk.selected', { count: selected.length })}
          clearLabel={t('results.bulk.clear')}
          exportLabel={t('results.bulk.export')}
          onClear={() => onSelectedChange([])}
          onExport={onExportSelection}
        />
      )}
    </section>
  )
}
