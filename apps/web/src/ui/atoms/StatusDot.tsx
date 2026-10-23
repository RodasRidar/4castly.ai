import { cn } from '../../lib/cn'

interface StatusDotProps {
  status: 'processing' | 'failed'
  /** Text alternative, e.g. "Calculando" or "Falló". */
  label: string
  className?: string
}

export function StatusDot({ status, label, className }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={label}
      data-status={status}
      className={cn(
        'inline-block size-2 rounded-full',
        status === 'failed' ? 'bg-critical-accent' : 'animate-pulse bg-mute motion-reduce:animate-none',
        className,
      )}
    />
  )
}
