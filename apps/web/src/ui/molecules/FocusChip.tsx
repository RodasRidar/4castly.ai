import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'

export interface FocusChipProps {
  /** Count text, e.g. "12 de 142 en foco". */
  countText: string
  /** Reset button text, e.g. "Restablecer". */
  resetLabel: string
  onReset: () => void
  className?: string
}

export function FocusChip({ countText, resetLabel, onReset, className }: FocusChipProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-hairline bg-selected py-0.5 pr-1 pl-3 text-body-md text-ink', className)}>
      <span role="status">{countText}</span>
      <span aria-hidden="true" className="text-mute">
        ·
      </span>
      <Button variant="ghost" size="sm" onClick={onReset} className="h-6 rounded-full px-2">
        {resetLabel}
      </Button>
    </span>
  )
}
