import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface StatLineProps {
  label: string
  value: ReactNode
  className?: string
}

export function StatLine({ label, value, className }: StatLineProps) {
  return (
    <dl className={cn('flex items-baseline justify-between gap-4 text-body-md', className)}>
      <dt className="text-mute">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </dl>
  )
}
