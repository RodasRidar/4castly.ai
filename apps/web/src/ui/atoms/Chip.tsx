import { X } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Single-select answer chip: exposes aria-pressed. */
  selectable?: boolean
  selected?: boolean
  onClick?: () => void
  /** Removable filter chip. `removeLabel` is the accessible name of the remove button. */
  onRemove?: () => void
  removeLabel?: string
}

const base = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-body-md'

export function Chip({ selectable, selected, onClick, onRemove, removeLabel, disabled, className, children, ...rest }: ChipProps) {
  if (onRemove) {
    return (
      <span className={cn(base, 'border-hairline bg-elevated text-ink', className)}>
        {children}
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-mr-1 inline-flex size-5 items-center justify-center rounded-full text-mute hover:bg-selected hover:text-ink"
        >
          <Icon icon={X} size="sm" />
        </button>
      </span>
    )
  }
  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selectable ? !!selected : undefined}
      className={cn(
        base,
        'disabled:cursor-not-allowed disabled:opacity-50',
        selectable && selected ? 'border-primary bg-selected font-medium text-ink' : 'border-hairline bg-elevated text-body hover:bg-selected hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}
