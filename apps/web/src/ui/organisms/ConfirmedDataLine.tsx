import { Check } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export interface ConfirmedDataLineProps {
  /** "Datos confirmados" */
  summaryLabel: string
  /** "Ver detalle" */
  toggleLabel: string
  /** Toggle text while expanded; defaults to `toggleLabel`. */
  hideLabel?: string
  defaultExpanded?: boolean
  /** Expandable detail. Without it the line has no toggle. */
  children?: ReactNode
  className?: string
}

export function ConfirmedDataLine({ summaryLabel, toggleLabel, hideLabel, defaultExpanded = false, children, className }: ConfirmedDataLineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const detailId = useId()
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="flex flex-wrap items-center gap-2 text-body-md text-ink">
        <Icon icon={Check} />
        <span>{summaryLabel}</span>
        {children !== undefined && (
          <>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={expanded ? detailId : undefined}
              onClick={() => setExpanded((v) => !v)}
              className="rounded text-body-md text-ink underline decoration-1 underline-offset-[3px] hover:decoration-2"
            >
              {expanded ? (hideLabel ?? toggleLabel) : toggleLabel}
            </button>
          </>
        )}
      </p>
      {expanded && children !== undefined && (
        <div id={detailId} className="rounded-md border border-hairline bg-elevated p-4 text-body-md text-body">
          {children}
        </div>
      )}
    </div>
  )
}
