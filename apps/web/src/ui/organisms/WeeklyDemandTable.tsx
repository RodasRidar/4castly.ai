import { CalendarX } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { DateValue } from '../atoms/DateValue'
import { NumberValue } from '../atoms/NumberValue'
import { EmptyState } from '../molecules/EmptyState'

export interface WeeklyDemandRow {
  /** First day of the week; rendered as a locale date (no week codes). */
  weekStart: Date
  low: number
  expected: number
  high: number
}

export interface WeeklyDemandTableProps {
  caption: string
  columns: { week: string; low: string; expected: string; high: string }
  /** Unit shown after numbers, e.g. "kg". */
  unit: string
  rows: WeeklyDemandRow[]
  empty: { title: string; body: string; action?: ReactNode }
  className?: string
}

/** Demand per week and scenario, with no stock involved: what is shown when the file had no stock column. */
export function WeeklyDemandTable({ caption, columns, unit, rows, empty, className }: WeeklyDemandTableProps) {
  const box = 'rounded-lg border border-hairline bg-elevated'
  if (rows.length === 0) {
    return (
      <div className={cn(box, className)}>
        <EmptyState icon={CalendarX} title={empty.title} body={empty.body} action={empty.action} />
      </div>
    )
  }
  const num = 'px-3 py-2.5 text-right text-body-md text-ink'
  const head = 'px-3 py-2 text-body-sm font-medium text-mute'
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={cn(box, 'overflow-x-auto', className)}>
      <table className="w-full min-w-max border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className={cn(head, 'text-left')}>{columns.week}</th>
            <th scope="col" className={cn(head, 'text-right')}>{columns.low}</th>
            <th scope="col" className={cn(head, 'text-right')}>{columns.expected}</th>
            <th scope="col" className={cn(head, 'text-right')}>{columns.high}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekStart.toISOString()} className="border-b border-hairline last:border-b-0">
              <th scope="row" className="px-3 py-2.5 text-left text-body-md font-normal text-ink">
                <DateValue date={r.weekStart} timeZone="UTC" />
              </th>
              <td className={num}><NumberValue value={r.low} unit={unit} /></td>
              <td className={num}><NumberValue value={r.expected} unit={unit} /></td>
              <td className={num}><NumberValue value={r.high} unit={unit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
