import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  body: string
  /** Optional call to action (a Button). */
  action?: ReactNode
  /** Heading level of the title; 1 when the state is the whole page. */
  headingLevel?: 1 | 2
  className?: string
}

export function EmptyState({ icon, title, body, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full border border-hairline text-mute">
        <Icon icon={icon} size="lg" />
      </span>
      <Heading className="text-body-lg font-medium text-ink">{title}</Heading>
      <p className="max-w-sm text-body-md text-mute">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
