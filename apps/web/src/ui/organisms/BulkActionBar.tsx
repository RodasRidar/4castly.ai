import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'

export interface BulkActionBarProps {
  /** Number of selected rows; the bar renders only when greater than 0. */
  count: number
  /** Accessible name of the toolbar. */
  label: string
  /** Visible count text, e.g. "3 seleccionados". */
  countText: string
  clearLabel: string
  exportLabel: string
  onClear: () => void
  onExport: () => void
  className?: string
}

export function BulkActionBar({ count, label, countText, clearLabel, exportLabel, onClear, onExport, className }: BulkActionBarProps) {
  if (count <= 0) return null
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-selected px-4 py-2', className)}
    >
      <span role="status" className="text-body-md font-medium text-ink">
        {countText}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
        <Button variant="secondary" size="sm" onClick={onExport}>
          {exportLabel}
        </Button>
      </div>
    </div>
  )
}
