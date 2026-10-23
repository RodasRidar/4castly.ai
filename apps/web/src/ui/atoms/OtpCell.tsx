import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface OtpCellProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'maxLength' | 'inputMode'> {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

export function OtpCell({ value, onChange, invalid, className, ...rest }: OtpCellProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      className={cn(
        'size-11 rounded-md border bg-elevated text-center font-mono text-heading-md text-ink',
        invalid ? 'border-critical' : value ? 'border-ink' : 'border-hairline',
        className,
      )}
    />
  )
}
