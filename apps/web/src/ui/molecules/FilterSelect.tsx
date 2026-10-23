import { useId } from 'react'
import { cn } from '../../lib/cn'
import { Select, type SelectOption } from '../atoms/Select'

export interface FilterSelectProps {
  /** Visible label and accessible name, e.g. "Riesgo". */
  label: string
  options: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function FilterSelect({ label, options, value, onValueChange, disabled, className }: FilterSelectProps) {
  const id = useId()
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <label htmlFor={id} className="text-body-md text-mute">
        {label}
      </label>
      <Select id={id} options={options} value={value} onValueChange={onValueChange} disabled={disabled} className="min-w-32" />
    </div>
  )
}
