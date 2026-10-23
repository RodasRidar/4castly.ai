import type { LucideIcon } from 'lucide-react'
import { Lock } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  leadingIcon?: LucideIcon
}

export function Input({ invalid, leadingIcon, readOnly, disabled, className, ...rest }: InputProps) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-2 rounded-md border bg-elevated px-3 text-body-md text-ink',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        invalid ? 'border-critical' : 'border-hairline',
        readOnly && 'bg-selected text-body',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {leadingIcon && (
        <span data-testid="input-leading-icon" className="text-mute">
          <Icon icon={leadingIcon} />
        </span>
      )}
      <input
        {...rest}
        readOnly={readOnly}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute"
      />
      {readOnly && (
        <span data-testid="input-lock" className="text-mute">
          <Icon icon={Lock} size="sm" />
        </span>
      )}
    </div>
  )
}
