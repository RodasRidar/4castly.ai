import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { Input } from '../atoms/Input'
import { NumberValue } from '../atoms/NumberValue'
import { Spinner } from '../atoms/Spinner'
import { VisuallyHidden } from '../atoms/VisuallyHidden'

export interface EditableCellProps {
  value: number
  onCommit: (value: number) => void
  /** Accessible name appended to the display button, e.g. "Editar plazo de entrega". */
  editLabel: string
  /** Accessible name of the input while editing. */
  inputLabel: string
  unit?: string
  min?: number
  max?: number
  /** Parent-driven state after a commit. Editing is internal. */
  status?: 'idle' | 'saving' | 'error'
  savingText?: string
  errorText?: string
  className?: string
}

export function EditableCell({ value, onCommit, editLabel, inputLabel, unit, min, max, status = 'idle', savingText, errorText, className }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const finished = useRef(false)

  const start = () => {
    finished.current = false
    setDraft(String(value))
    setInvalid(false)
    setEditing(true)
  }
  const cancel = () => {
    finished.current = true
    setEditing(false)
  }
  /** Returns false when the draft is not a valid number in range (editing stays open). */
  const commit = (): boolean => {
    const n = draft.trim() === '' ? NaN : Number(draft)
    if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      setInvalid(true)
      return false
    }
    finished.current = true
    setEditing(false)
    if (n !== value) onCommit(n)
    return true
  }

  if (editing) {
    return (
      <Input
        type="number"
        inputMode="numeric"
        aria-label={inputLabel}
        value={draft}
        invalid={invalid}
        min={min}
        max={max}
        autoFocus
        className={cn('h-8 w-24', className)}
        onChange={(e) => {
          setDraft(e.target.value)
          setInvalid(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={() => {
          if (finished.current) return
          if (!commit()) cancel()
        }}
      />
    )
  }

  return (
    <span className={cn('inline-flex flex-col items-start', className)}>
      <button
        type="button"
        onClick={start}
        disabled={status === 'saving'}
        aria-busy={status === 'saving' || undefined}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-body-md text-ink hover:bg-selected disabled:cursor-not-allowed',
          status === 'error' && 'border border-critical-border',
        )}
      >
        <NumberValue value={value} unit={unit} />
        {status === 'saving' ? <Spinner size="sm" decorative /> : <Icon icon={Pencil} size="sm" className="text-mute" />}
        <VisuallyHidden>{editLabel}</VisuallyHidden>
      </button>
      {status === 'saving' && savingText && <span className="text-body-sm text-mute">{savingText}</span>}
      {status === 'error' && errorText && (
        <span role="alert" className="text-body-sm text-critical">
          {errorText}
        </span>
      )}
    </span>
  )
}
