import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Badge } from '../atoms/Badge'
import { Icon } from '../atoms/Icon'

export interface SourceCardProps {
  variant: 'upload' | 'soon'
  title: string
  description?: string
  icon?: LucideIcon
  /** Text of the "coming soon" badge. Required for the `soon` variant. */
  soonLabel?: string
  /** Content of the primary card (dropzone, button). Ignored by the `soon` variant. */
  children?: ReactNode
  className?: string
}

export function SourceCard({ variant, title, description, icon, soonLabel, children, className }: SourceCardProps) {
  const headingId = useId()
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <Icon icon={icon} size="lg" className="text-mute" />}
        <h2 id={headingId} className="text-body-lg font-medium text-ink">
          {title}
        </h2>
      </div>
      {variant === 'soon' && soonLabel && <Badge tone="soon">{soonLabel}</Badge>}
    </div>
  )
  if (variant === 'soon') {
    return (
      <div
        data-variant="soon"
        aria-disabled="true"
        className={cn('flex flex-col gap-2 rounded-lg border border-hairline bg-canvas p-5 text-mute', className)}
      >
        {header}
        {description && <p className="text-body-md">{description}</p>}
      </div>
    )
  }
  return (
    <section
      aria-labelledby={headingId}
      data-variant="upload"
      className={cn('flex flex-col gap-4 rounded-lg border border-hairline bg-elevated p-5', className)}
    >
      {header}
      {description && <p className="text-body-md text-mute">{description}</p>}
      {children}
    </section>
  )
}
