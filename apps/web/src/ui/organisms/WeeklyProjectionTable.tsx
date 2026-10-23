import { CalendarX } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { DateValue } from '../atoms/DateValue'
import { NumberValue } from '../atoms/NumberValue'
import { SegmentedControl } from '../atoms/SegmentedControl'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { EmptyState } from '../molecules/EmptyState'
import { ErrorState } from '../molecules/ErrorState'
import { RiskBadge, type RiskLevel } from '../molecules/RiskBadge'

export interface WeeklyProjectionRow {
  /** First day of the week; rendered as a locale date (no week codes). */
  weekStart: Date
  low: number
  expected: number
  high: number
  projectedStock: number
  shortfall: number
  status: { level: RiskLevel; label: string }
}

export interface WeeklyProjectionTableProps {
  state: 'loading' | 'empty' | 'error' | 'populated'
  caption: string
  columns: { week: string; low: string; expected: string; high: string; stock: string; shortfall: string; status: string }
  /** Unit shown after numbers, e.g. "u". */
  unit: string
  rows: WeeklyProjectionRow[]
  scenario: {
    /** Accessible name of the toggle, e.g. "Escenario de compra". */
    label: string
    value: string
    onValueChange: (value: string) => void
    options: { value: string; label: string }[]
  }
  loadingLabel: string
  empty: { title: string; body: string; action?: ReactNode }
  error: { title: string; body: string; action?: ReactNode }
  /** Number of skeleton rows while loading. */
  loadingRows?: number
  className?: string
}

export function WeeklyProjectionTable({ state, caption, columns, unit, rows, scenario, loadingLabel, empty, error, loadingRows = 6, className }: WeeklyProjectionTableProps) {
  const box = 'rounded-lg border border-hairline bg-elevated'
  const headers = [columns.week, columns.low, columns.expected, columns.high, columns.stock, columns.shortfall, columns.status]
  const toggle = (
    <SegmentedControl aria-label={scenario.label} options={scenario.options} value={scenario.value} onValueChange={scenario.onValueChange} />
  )

  if (state === 'empty' || state === 'error') {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        <div>{toggle}</div>
        <div className={box}>
          {state === 'empty' ? (
            <EmptyState icon={CalendarX} title={empty.title} body={empty.body} action={empty.action} />
          ) : (
            <ErrorState title={error.title} body={error.body} primaryAction={error.action} />
          )}
        </div>
      </div>
    )
  }

  const loading = state === 'loading'
  const num = 'px-3 py-2.5 text-right text-body-md text-ink'
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy={loading || undefined}>
      <div>{toggle}</div>
      <div role="region" aria-label={caption} tabIndex={0} className={cn(box, 'overflow-x-auto')}>
        <table className="w-full min-w-max border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-hairline">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={cn('px-3 py-2 text-body-sm font-medium text-mute', i === 0 || i === headers.length - 1 ? 'text-left' : 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: loadingRows }, (_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-b-0">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-3">
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={r.weekStart.toISOString()} className="border-b border-hairline last:border-b-0">
                    <th scope="row" className="px-3 py-2.5 text-left text-body-md font-normal text-ink">
                      <DateValue date={r.weekStart} timeZone="UTC" />
                    </th>
                    <td className={num}><NumberValue value={r.low} unit={unit} /></td>
                    <td className={num}><NumberValue value={r.expected} unit={unit} /></td>
                    <td className={num}><NumberValue value={r.high} unit={unit} /></td>
                    <td className={num}><NumberValue value={r.projectedStock} unit={unit} /></td>
                    <td className={num}><NumberValue value={r.shortfall} unit={unit} /></td>
                    <td className="px-3 py-2.5 text-left"><RiskBadge level={r.status.level} label={r.status.label} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
        {loading && <VisuallyHidden>{loadingLabel}</VisuallyHidden>}
      </div>
    </div>
  )
}
