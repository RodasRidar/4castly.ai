import { Lock, SendHorizontal, Square } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useId } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { IconButton } from '../atoms/IconButton'
import { Kbd } from '../atoms/Kbd'
import { Textarea } from '../atoms/Textarea'

export interface ComposerProps {
  /** Accessible name of the textarea. */
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  onSend: (value: string) => void
  onStop?: () => void
  sendLabel: string
  stopLabel: string
  /** The assistant is answering: Stop replaces Send and Enter does not send. */
  generating?: boolean
  /** The conversation stage does not allow questions. */
  locked?: boolean
  /** Visible explanation shown while locked. */
  lockedReason?: string
  /** Hint texts rendered next to the Enter / Shift+Enter keys. */
  hint: { send: string; newline: string }
  maxRows?: number
  className?: string
}

export function Composer({
  label,
  placeholder,
  value,
  onChange,
  onSend,
  onStop,
  sendLabel,
  stopLabel,
  generating = false,
  locked = false,
  lockedReason,
  hint,
  maxRows = 6,
  className,
}: ComposerProps) {
  const reasonId = useId()
  const hintId = useId()
  const canSend = !locked && !generating && value.trim().length > 0

  const send = () => {
    if (canSend) onSend(value.trim())
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    send()
  }

  const describedBy = [locked && lockedReason ? reasonId : null, hintId].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {locked && lockedReason && (
        <p id={reasonId} className="flex items-center gap-2 text-body-sm text-mute">
          <Icon icon={Lock} size="sm" />
          {lockedReason}
        </p>
      )}
      {/* One card like Claude Code Desktop: the textarea grows inside it and send sits in its corner. */}
      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border border-hairline bg-elevated p-2 transition-colors',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
          locked && 'opacity-60',
        )}
      >
        <Textarea
          aria-label={label}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={value}
          maxRows={maxRows}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="rounded-none border-0 bg-transparent px-1 py-1.5 outline-none focus-visible:outline-none"
        />
        {generating ? (
          <IconButton variant="outline" label={stopLabel} icon={Square} onClick={onStop} />
        ) : (
          <IconButton variant="outline" label={sendLabel} icon={SendHorizontal} disabled={!canSend} onClick={send} />
        )}
      </div>
      <p id={hintId} className="flex flex-wrap items-center gap-x-1.5 px-1 text-body-sm text-mute">
        <Kbd>Enter</Kbd> <span>{hint.send}</span> <span aria-hidden="true">·</span> <Kbd>Shift</Kbd>
        <span aria-hidden="true">+</span>
        <Kbd>Enter</Kbd> <span>{hint.newline}</span>
      </p>
    </div>
  )
}
