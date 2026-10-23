import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { StageStep } from '../molecules/StageStep'
import { ToolStatusLine } from '../molecules/ToolStatusLine'

export interface JobProgressStep {
  id: string
  label: string
}

export interface JobProgressProps {
  /** Accessible name of the step list. */
  label: string
  /** Four-step stepper. Omit for the simple loader (`text`). */
  steps?: readonly JobProgressStep[]
  /** Index of the active step; an index past the last step marks every step done. */
  activeIndex?: number
  statusLabels?: { done: string; active: string; pending: string }
  /** Simple loader text such as "Calculando pronósticos…". */
  text?: string
  cancelLabel?: string
  onCancel?: () => void
  className?: string
}

export function JobProgress({ label, steps, activeIndex = 0, statusLabels, text, cancelLabel, onCancel, className }: JobProgressProps) {
  const active = steps?.[activeIndex]
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      {steps ? (
        <>
          <ol aria-label={label} className="flex flex-col gap-2">
            {steps.map((s, i) => {
              const status = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
              return <StageStep key={s.id} status={status} label={s.label} statusLabel={statusLabels?.[status] ?? ''} />
            })}
          </ol>
          <VisuallyHidden data-testid="job-progress-live" aria-live="polite" role="status">
            {active?.label}
          </VisuallyHidden>
        </>
      ) : (
        text && <ToolStatusLine text={text} />
      )}
      {cancelLabel && onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-3 text-mute underline">
          {cancelLabel}
        </Button>
      )}
    </div>
  )
}
