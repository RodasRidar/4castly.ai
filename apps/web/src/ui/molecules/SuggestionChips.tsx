import { cn } from '../../lib/cn'
import { Chip } from '../atoms/Chip'

const MAX = 3

export interface SuggestionChipsProps {
  /** Accessible name of the group. */
  label: string
  /** Only the first three are shown. */
  suggestions: readonly string[]
  /** Disabled while the composer is locked. */
  locked?: boolean
  onSelect: (suggestion: string) => void
  className?: string
}

export function SuggestionChips({ label, suggestions, locked = false, onSelect, className }: SuggestionChipsProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {suggestions.slice(0, MAX).map((s) => (
        <Chip key={s} disabled={locked} onClick={() => onSelect(s)}>
          {s}
        </Chip>
      ))}
    </div>
  )
}
