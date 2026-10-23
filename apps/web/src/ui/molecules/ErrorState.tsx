import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export interface ErrorStateProps {
  title: string
  body: string
  /** Short reference the user can quote to support, e.g. "Referencia: 7F3A-92". */
  supportReference?: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  className?: string
}

export function ErrorState({ title, body, supportReference, primaryAction, secondaryAction, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-full border border-critical-border bg-critical-bg text-critical">
        <Icon icon={CircleAlert} size="lg" />
      </span>
      <h2 className="text-body-lg font-medium text-ink">{title}</h2>
      <p className="max-w-sm text-body-md text-mute">{body}</p>
      {supportReference && <p className="font-mono text-body-sm text-faint">{supportReference}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
