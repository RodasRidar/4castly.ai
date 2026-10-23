import { FileSpreadsheet, RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { IconButton } from '../atoms/IconButton'
import { Spinner } from '../atoms/Spinner'
import { VisuallyHidden } from '../atoms/VisuallyHidden'

export interface FileChipProps {
  name: string
  /** Pre-formatted size (e.g. a NumberValue node or "1,2 MB"); rendered in mono. */
  size?: ReactNode
  state?: 'idle' | 'uploading' | 'error'
  uploadingText?: string
  errorText?: string
  onRemove?: () => void
  removeLabel?: string
  onChange?: () => void
  changeLabel?: string
  className?: string
}

const TAIL = 10

export function FileChip({
  name,
  size,
  state = 'idle',
  uploadingText,
  errorText,
  onRemove,
  removeLabel,
  onChange,
  changeLabel,
  className,
}: FileChipProps) {
  const split = name.length > TAIL * 2
  const head = split ? name.slice(0, -TAIL) : name
  const tail = split ? name.slice(-TAIL) : ''
  return (
    <div
      data-testid="file-chip"
      data-state={state}
      aria-busy={state === 'uploading' || undefined}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border bg-elevated px-3 py-2 text-body-md',
        state === 'error' ? 'border-critical-border' : 'border-hairline',
        className,
      )}
    >
      {state === 'uploading' ? <Spinner size="sm" decorative /> : <Icon icon={FileSpreadsheet} className="text-mute" />}
      <span className="flex min-w-0 flex-col">
        <span title={name} className="flex min-w-0 text-ink">
          <VisuallyHidden>{name}</VisuallyHidden>
          <span aria-hidden="true" className="truncate">
            {head}
          </span>
          {tail && (
            <span aria-hidden="true" className="shrink-0">
              {tail}
            </span>
          )}
        </span>
        {state === 'uploading' && uploadingText && <span className="text-body-sm text-mute">{uploadingText}</span>}
        {state === 'error' && errorText && (
          <span role="alert" className="text-body-sm text-critical">
            {errorText}
          </span>
        )}
      </span>
      {size !== undefined && <span className="shrink-0 font-mono text-body-sm text-mute tabular-nums">{size}</span>}
      {onChange && changeLabel && <IconButton size="sm" label={changeLabel} icon={RefreshCw} onClick={onChange} />}
      {onRemove && removeLabel && <IconButton size="sm" label={removeLabel} icon={X} onClick={onRemove} />}
    </div>
  )
}
