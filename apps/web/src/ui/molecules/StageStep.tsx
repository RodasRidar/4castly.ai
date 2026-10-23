import { Check, Circle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { Spinner } from '../atoms/Spinner'
import { VisuallyHidden } from '../atoms/VisuallyHidden'

export type StageStatus = 'done' | 'active' | 'pending'

export interface StageStepProps {
  status: StageStatus
  label: string
  /** Text equivalent of the state (e.g. "Completado"), so state never relies on icon or color alone. */
  statusLabel: string
  className?: string
}

export function StageStep({ status, label, statusLabel, className }: StageStepProps) {
  return (
    <li
      data-status={status}
      aria-current={status === 'active' ? 'step' : undefined}
      className={cn('flex items-center gap-2 text-body-md', status === 'pending' ? 'text-mute' : 'text-ink', status === 'active' && 'font-medium', className)}
    >
      <span className="flex size-5 items-center justify-center">
        {status === 'done' && <Icon icon={Check} />}
        {status === 'active' && <Spinner decorative size="sm" />}
        {status === 'pending' && <Icon icon={Circle} size="sm" />}
      </span>
      <span>{label}</span>
      <VisuallyHidden>{statusLabel}</VisuallyHidden>
    </li>
  )
}
