import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { ThHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export type SortState = 'none' | 'asc' | 'desc'

export interface ColumnHeaderProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'children'> {
  label: string
  /** Omit for a non-sortable column. */
  sort?: SortState
  /** Accessible name of the sort button, e.g. "Ordenar por Riesgo". Required when `sort` is set. */
  sortLabel?: string
  onSort?: () => void
  sticky?: boolean
}

const ariaSort = { none: 'none', asc: 'ascending', desc: 'descending' } as const
const sortIcon = { none: ChevronsUpDown, asc: ArrowUp, desc: ArrowDown } as const

export function ColumnHeader({ label, sort, sortLabel, onSort, sticky, className, ...rest }: ColumnHeaderProps) {
  return (
    <th
      {...rest}
      scope="col"
      aria-sort={sort ? ariaSort[sort] : undefined}
      className={cn(
        'px-3 py-2 text-left text-body-sm font-medium text-mute',
        sticky && 'sticky top-0 z-10 bg-canvas',
        className,
      )}
    >
      {sort ? (
        <button
          type="button"
          aria-label={sortLabel}
          onClick={onSort}
          className="inline-flex items-center gap-1 rounded-md hover:text-ink"
        >
          {label}
          <Icon icon={sortIcon[sort]} size="sm" />
        </button>
      ) : (
        label
      )}
    </th>
  )
}
