import { SearchX, SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Checkbox } from '../atoms/Checkbox'
import { DateValue } from '../atoms/DateValue'
import { Icon } from '../atoms/Icon'
import { NumberValue } from '../atoms/NumberValue'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { ColumnHeader } from '../molecules/ColumnHeader'
import { EmptyState } from '../molecules/EmptyState'
import { EditableCell } from '../molecules/EditableCell'
import { ErrorState } from '../molecules/ErrorState'
import { Pagination, type PaginationProps } from '../molecules/Pagination'
import { RiskBadge, type RiskLevel } from '../molecules/RiskBadge'
import { Popover } from './Popover'

export type ProductColumnId = 'name' | 'abc' | 'demand' | 'stock' | 'coverage' | 'risk' | 'suggested' | 'buyBefore' | 'leadTime'

const RESULTS_COLUMNS: ProductColumnId[] = ['name', 'abc', 'demand', 'stock', 'coverage', 'risk']
const PORTFOLIO_COLUMNS: ProductColumnId[] = [...RESULTS_COLUMNS, 'suggested', 'buyBefore', 'leadTime']

export interface ProductRow {
  code: string
  name: string
  abcClass: string
  /** Typical demand per week. */
  typicalDemand: number
  stock: number | null
  coverageWeeks: number | null
  risk: { level: RiskLevel; label: string } | null
  /** Portfolio mode. */
  suggestedQuantity?: number | null
  buyBefore?: Date | null
  leadTimeDays?: number
  leadTimeStatus?: 'idle' | 'saving' | 'error'
}

export interface ProductTableLabels {
  /** Caption of the table and accessible name of its scroll region. */
  caption: string
  columns: Record<ProductColumnId, string>
  units: { demand: string; stock: string; coverage: string; suggested: string; leadTime: string }
  /** Accessible name of a sort button, e.g. (c) => `Ordenar por ${c}`. */
  sortBy: (columnLabel: string) => string
  selectAll: string
  selectRow: (productName: string) => string
  /** Visible text of the column picker button. */
  columnPicker: string
  /** Accessible name of the column picker popover. */
  columnPickerLabel: string
  editLeadTime: (productName: string) => string
  leadTimeInput: (productName: string) => string
  savingText: string
  errorText: string
  /** Screen-reader text while loading. */
  loading: string
  empty: { title: string; body: string; action?: ReactNode }
  error: { title: string; body: string; action?: ReactNode }
}

export interface ProductSort {
  column: ProductColumnId
  direction: 'asc' | 'desc'
}

export interface ProductTableProps {
  state: 'loading' | 'empty' | 'error' | 'populated'
  /** `results` shows six columns; `portfolio` adds purchase columns and lead-time editing. */
  mode: 'results' | 'portfolio'
  rows: ProductRow[]
  labels: ProductTableLabels
  sort: ProductSort | null
  onSortChange: (column: ProductColumnId) => void
  /** Called with the product code from the name button (Enter/click). */
  onOpenProduct: (code: string) => void
  /** Selection is enabled when `onSelectionChange` is provided. */
  selectedCodes?: string[]
  onSelectionChange?: (codes: string[]) => void
  /** Portfolio: commit of the editable lead time. */
  onLeadTimeChange?: (code: string, days: number) => void
  /** Columns that do not apply to this data (e.g. everything that needs stock): not shown and not offered in the picker. */
  hiddenColumns?: ProductColumnId[]
  /** Controlled visible columns; omit for internal state (all columns of the mode). */
  visibleColumns?: ProductColumnId[]
  onVisibleColumnsChange?: (columns: ProductColumnId[]) => void
  pagination?: PaginationProps
  loadingRows?: number
  className?: string
}

export function ProductTable({
  state,
  mode,
  rows,
  labels,
  sort,
  onSortChange,
  onOpenProduct,
  selectedCodes = [],
  onSelectionChange,
  onLeadTimeChange,
  hiddenColumns,
  visibleColumns,
  onVisibleColumnsChange,
  pagination,
  loadingRows = 5,
  className,
}: ProductTableProps) {
  const modeColumns = (mode === 'portfolio' ? PORTFOLIO_COLUMNS : RESULTS_COLUMNS).filter((c) => !hiddenColumns?.includes(c))
  const [internalVisible, setInternalVisible] = useState<ProductColumnId[] | null>(null)
  const chosen = visibleColumns ?? internalVisible ?? modeColumns
  const columns = modeColumns.filter((c) => c === 'name' || chosen.includes(c))
  const setVisible = (next: ProductColumnId[]) => {
    setInternalVisible(next)
    onVisibleColumnsChange?.(next)
  }
  const selectable = Boolean(onSelectionChange)
  const box = 'rounded-lg border border-hairline bg-elevated'

  if (state === 'empty') {
    return (
      <div className={cn(box, className)}>
        <EmptyState icon={SearchX} title={labels.empty.title} body={labels.empty.body} action={labels.empty.action} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className={cn(box, className)}>
        <ErrorState title={labels.error.title} body={labels.error.body} primaryAction={labels.error.action} />
      </div>
    )
  }

  const pageCodes = rows.map((r) => r.code)
  const selectedOnPage = pageCodes.filter((c) => selectedCodes.includes(c))
  const headerChecked = rows.length > 0 && selectedOnPage.length === rows.length ? true : selectedOnPage.length > 0 ? 'indeterminate' : false
  const toggleAll = () => {
    if (headerChecked === true) onSelectionChange?.(selectedCodes.filter((c) => !pageCodes.includes(c)))
    else onSelectionChange?.([...selectedCodes, ...pageCodes.filter((c) => !selectedCodes.includes(c))])
  }
  const toggleRow = (code: string) =>
    onSelectionChange?.(selectedCodes.includes(code) ? selectedCodes.filter((c) => c !== code) : [...selectedCodes, code])

  const nameLeft = selectable ? 'left-10' : 'left-0'
  const loading = state === 'loading'

  const picker = (
    <Popover
      label={labels.columnPickerLabel}
      side="bottom"
      align="end"
      trigger={
        <Button variant="secondary" size="sm" iconLeft={<Icon icon={SlidersHorizontal} size="sm" />}>
          {labels.columnPicker}
        </Button>
      }
    >
      <ul className="flex flex-col gap-1">
        {modeColumns
          .filter((c) => c !== 'name')
          .map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body-md text-ink hover:bg-selected">
                <Checkbox
                  aria-label={labels.columns[c]}
                  checked={columns.includes(c)}
                  onCheckedChange={(v) => setVisible(v === true ? modeColumns.filter((m) => m === 'name' || m === c || columns.includes(m)) : columns.filter((m) => m !== c))}
                />
                {labels.columns[c]}
              </label>
            </li>
          ))}
      </ul>
    </Popover>
  )

  const cell = 'px-3 py-3 align-middle text-body-md text-ink'

  const renderCell = (row: ProductRow, id: ProductColumnId): ReactNode => {
    switch (id) {
      case 'name':
        return (
          <td key={id} className={cn(cell, 'sticky z-10 min-w-48 bg-canvas', nameLeft)}>
            <button
              type="button"
              onClick={() => onOpenProduct(row.code)}
              className="flex flex-col items-start rounded-md text-left hover:underline"
            >
              <span className="font-medium text-ink">{row.name}</span>
              <span className="font-mono text-body-sm text-mute">{row.code}</span>
            </button>
          </td>
        )
      case 'abc':
        return <td key={id} className={cell}>{row.abcClass}</td>
      case 'demand':
        return <td key={id} className={cell}><NumberValue value={row.typicalDemand} unit={labels.units.demand} /></td>
      case 'stock':
        return <td key={id} className={cell}><NumberValue value={row.stock} unit={labels.units.stock} /></td>
      case 'coverage':
        return <td key={id} className={cell}><NumberValue value={row.coverageWeeks} unit={labels.units.coverage} /></td>
      case 'risk':
        return <td key={id} className={cell}>{row.risk ? <RiskBadge level={row.risk.level} label={row.risk.label} /> : <span className="font-mono text-mute">—</span>}</td>
      case 'suggested':
        return <td key={id} className={cell}><NumberValue value={row.suggestedQuantity} unit={labels.units.suggested} /></td>
      case 'buyBefore':
        return <td key={id} className={cell}>{row.buyBefore ? <DateValue date={row.buyBefore} timeZone="UTC" /> : <span className="font-mono text-mute">—</span>}</td>
      case 'leadTime':
        return (
          <td key={id} className={cell}>
            {row.leadTimeDays === undefined ? (
              <span className="font-mono text-mute">—</span>
            ) : onLeadTimeChange ? (
              <EditableCell
                value={row.leadTimeDays}
                unit={labels.units.leadTime}
                min={1}
                status={row.leadTimeStatus}
                savingText={labels.savingText}
                errorText={labels.errorText}
                editLabel={labels.editLeadTime(row.name)}
                inputLabel={labels.leadTimeInput(row.name)}
                onCommit={(days) => onLeadTimeChange(row.code, days)}
              />
            ) : (
              <NumberValue value={row.leadTimeDays} unit={labels.units.leadTime} />
            )}
          </td>
        )
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy={loading || undefined}>
      <div className="flex justify-end">{picker}</div>
      <div role="region" aria-label={labels.caption} tabIndex={0} className={cn(box, 'overflow-x-auto')}>
        <table className="w-full min-w-max border-collapse">
          <caption className="sr-only">{labels.caption}</caption>
          <thead>
            <tr className="border-b border-hairline">
              {selectable && (
                <th scope="col" className="sticky left-0 z-20 w-10 bg-canvas px-3 py-2">
                  <Checkbox aria-label={labels.selectAll} checked={headerChecked} onCheckedChange={toggleAll} disabled={loading} />
                </th>
              )}
              {columns.map((id) => {
                const sortable = !loading
                return (
                  <ColumnHeader
                    key={id}
                    label={labels.columns[id]}
                    sort={sortable ? (sort?.column === id ? sort.direction : 'none') : undefined}
                    sortLabel={labels.sortBy(labels.columns[id])}
                    onSort={() => onSortChange(id)}
                    className={cn(id === 'name' && cn('sticky z-20 bg-canvas', nameLeft))}
                  />
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-b-0">
                    {selectable && <td className="px-3 py-3" />}
                    {columns.map((id) => (
                      <td key={id} className="px-3 py-3">
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={row.code} className="border-b border-hairline last:border-b-0 hover:bg-selected">
                    {selectable && (
                      <td className="sticky left-0 z-10 w-10 bg-canvas px-3 py-3">
                        <Checkbox aria-label={labels.selectRow(row.name)} checked={selectedCodes.includes(row.code)} onCheckedChange={() => toggleRow(row.code)} />
                      </td>
                    )}
                    {columns.map((id) => renderCell(row, id))}
                  </tr>
                ))}
          </tbody>
        </table>
        {loading && <VisuallyHidden>{labels.loading}</VisuallyHidden>}
      </div>
      {pagination && !loading && <Pagination {...pagination} />}
    </div>
  )
}
