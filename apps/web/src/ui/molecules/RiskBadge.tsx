import { CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export type RiskLevel = 'critical' | 'medium' | 'optimal'

export interface RiskBadgeProps {
  level: RiskLevel
  /** Visible text, e.g. "Crítico". Color is never the only signal: icon and text always render. */
  label: string
  className?: string
}

const levels: Record<RiskLevel, { icon: LucideIcon; classes: string }> = {
  critical: { icon: OctagonAlert, classes: 'border-critical-border bg-critical-bg text-critical' },
  medium: { icon: TriangleAlert, classes: 'border-medium-border bg-medium-bg text-medium' },
  optimal: { icon: CircleCheck, classes: 'border-optimal-border bg-optimal-bg text-optimal' },
}

export function RiskBadge({ level, label, className }: RiskBadgeProps) {
  const { icon, classes } = levels[level]
  return (
    <span
      data-level={level}
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-body-sm font-medium', classes, className)}
    >
      <Icon icon={icon} size="sm" />
      {label}
    </span>
  )
}
