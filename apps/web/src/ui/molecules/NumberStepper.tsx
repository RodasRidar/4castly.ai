import { Minus, Plus } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from '../atoms/IconButton'
import { NumberValue } from '../atoms/NumberValue'

export interface NumberStepperProps {
  value: number
  onChange: (value: number) => void
  /** Accessible name of the spinbutton, e.g. "Cobertura objetivo". */
  label: string
  decrementLabel: string
  incrementLabel: string
  unit?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}

export function NumberStepper({
  value,
  onChange,
  label,
  decrementLabel,
  incrementLabel,
  unit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  disabled,
  className,
}: NumberStepperProps) {
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    if (!disabled && clamped !== value) onChange(clamped)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const actions: Record<string, () => void> = {
      ArrowUp: () => set(value + step),
      ArrowDown: () => set(value - step),
      Home: () => Number.isFinite(min) && set(min),
      End: () => Number.isFinite(max) && set(max),
    }
    const action = actions[e.key]
    if (!action) return
    e.preventDefault()
    action()
  }
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <IconButton variant="outline" size="sm" label={decrementLabel} icon={Minus} disabled={disabled || value <= min} onClick={() => set(value - step)} />
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={unit ? `${value} ${unit}` : String(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="min-w-14 rounded-md px-2 text-center text-body-md text-ink"
      >
        <NumberValue value={value} unit={unit} />
      </span>
      <IconButton variant="outline" size="sm" label={incrementLabel} icon={Plus} disabled={disabled || value >= max} onClick={() => set(value + step)} />
    </div>
  )
}
