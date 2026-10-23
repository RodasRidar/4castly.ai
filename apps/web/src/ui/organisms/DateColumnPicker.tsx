import { useId, useState, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'

export interface DateColumnCandidate {
  id: string
  name: string
  samples: readonly string[]
}

export interface DateColumnPickerProps {
  /** Accessible name of the listbox. */
  label: string
  columns: readonly DateColumnCandidate[]
  /** Currently chosen column id (aria-selected). */
  value?: string | null
  onSelect: (columnId: string) => void
  noDatesLabel: string
  onNoDates: () => void
  /** Shown instead of the listbox when there are no plausible columns. */
  emptyText?: string
  disabled?: boolean
  className?: string
}

export function DateColumnPicker({ label, columns, value, onSelect, noDatesLabel, onNoDates, emptyText, disabled, className }: DateColumnPickerProps) {
  const base = useId()
  const [activeIndex, setActiveIndex] = useState(0)
  const optionId = (i: number) => `${base}-opt-${i}`
  const last = columns.length - 1

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, activeIndex + 1),
      ArrowUp: Math.max(0, activeIndex - 1),
      Home: 0,
      End: last,
    }
    if (e.key in moves) {
      e.preventDefault()
      setActiveIndex(moves[e.key]!)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const col = columns[activeIndex]
      if (col) onSelect(col.id)
    }
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {columns.length > 0 ? (
        <div
          role="listbox"
          aria-label={label}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          aria-activedescendant={optionId(Math.min(activeIndex, last))}
          onKeyDown={onKeyDown}
          className="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-elevated"
        >
          {columns.map((c, i) => (
            <div
              key={c.id}
              id={optionId(i)}
              role="option"
              aria-selected={value === c.id}
              data-active={i === activeIndex || undefined}
              onClick={() => {
                if (disabled) return
                setActiveIndex(i)
                onSelect(c.id)
              }}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 px-4 py-3 hover:bg-selected',
                (i === activeIndex || value === c.id) && 'bg-selected',
                value === c.id && 'font-medium',
              )}
            >
              <span className="text-body-md text-ink">{c.name}</span>
              <span className="truncate font-mono text-body-sm text-mute">{c.samples.join(', ')}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-body-md text-mute">{emptyText}</p>
      )}
      <div>
        <Button variant="secondary" onClick={onNoDates} disabled={disabled}>
          {noDatesLabel}
        </Button>
      </div>
    </div>
  )
}
