import { cn } from '../../lib/cn'

interface SpinnerProps {
  size?: 'sm' | 'md'
  label?: string
  /** Use inside a control that already has an accessible name. */
  decorative?: boolean
  className?: string
}

export function Spinner({ size = 'md', label, decorative, className }: SpinnerProps) {
  return (
    <span
      data-size={size}
      {...(decorative ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-hairline border-t-ink',
        size === 'sm' ? 'size-3.5' : 'size-5',
        className,
      )}
    />
  )
}
