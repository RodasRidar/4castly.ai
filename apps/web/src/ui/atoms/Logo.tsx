import { cn } from '../../lib/cn'

interface LogoProps {
  variant?: 'mark' | 'full'
  className?: string
}

export function Logo({ variant = 'full', className }: LogoProps) {
  const mark = (
    <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-body-sm font-semibold text-primary-fg">
      4C
    </span>
  )
  if (variant === 'mark') {
    return (
      <span role="img" aria-label="4Castly" className={cn('inline-flex', className)}>
        <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-body-sm font-semibold text-primary-fg">
          4C
        </span>
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {mark}
      <span className="text-body-lg font-semibold text-ink">4Castly</span>
    </span>
  )
}
