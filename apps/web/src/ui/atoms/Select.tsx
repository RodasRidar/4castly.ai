import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[]
  /** Label of an option with value "" such as "— No tengo esta columna —". */
  emptyOption?: string
  invalid?: boolean
  onValueChange?: (value: string) => void
}

export function Select({ options, emptyOption, invalid, onValueChange, className, ...rest }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        {...rest}
        aria-invalid={invalid || undefined}
        onChange={(e) => onValueChange?.(e.target.value)}
        className={cn(
          'h-9 w-full appearance-none rounded-md border bg-elevated pr-8 pl-3 text-body-md text-ink',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-critical' : 'border-hairline',
        )}
      >
        {emptyOption !== undefined && <option value="">{emptyOption}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-mute">
        <Icon icon={ChevronDown} size="sm" />
      </span>
    </div>
  )
}
