import { cn } from '../../lib/cn'

export type ReliabilityLevel = 'high' | 'medium' | 'low'

export interface ReliabilityBadgeProps {
  level: ReliabilityLevel
  /** Visible text, e.g. "Alta". Text comes first; the marks are decorative. */
  label: string
  className?: string
}

const filledCount: Record<ReliabilityLevel, number> = { high: 3, medium: 2, low: 1 }

export function ReliabilityBadge({ level, label, className }: ReliabilityBadgeProps) {
  return (
    <span
      data-level={level}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-hairline bg-elevated px-2 py-0.5 text-body-sm font-medium text-ink', className)}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {[0, 1, 2].map((i) => {
          const filled = i < filledCount[level]
          return <span key={i} data-filled={filled} className={cn('size-1.5 rounded-full', filled ? 'bg-ink' : 'bg-selected')} />
        })}
      </span>
    </span>
  )
}
