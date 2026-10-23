import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn'
import { OtpCell } from '../atoms/OtpCell'

export interface OtpInputProps {
  /** Accessible name of the group of cells. */
  groupLabel: string
  /** Accessible name of each cell, e.g. (i) => `Dígito ${i + 1}`. */
  cellLabel: (index: number) => string
  onComplete: (code: string) => void
  onChange?: (code: string) => void
  /** Controlled value (digits only). Omit for uncontrolled. */
  value?: string
  length?: number
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export function OtpInput({
  groupLabel,
  cellLabel,
  onComplete,
  onChange,
  value,
  length = 6,
  invalid,
  disabled,
  autoFocus,
  className,
}: OtpInputProps) {
  const [inner, setInner] = useState('')
  const code = (value ?? inner).slice(0, length)
  const group = useRef<HTMLDivElement>(null)

  const commit = (next: string) => {
    setInner(next)
    onChange?.(next)
    if (next.length === length) onComplete(next)
  }
  const focusCell = (i: number) =>
    group.current?.querySelectorAll('input')[Math.max(0, Math.min(length - 1, i))]?.focus()

  const setDigit = (i: number, digit: string) => {
    const chars = Array.from({ length }, (_, k) => code[k] ?? ' ')
    chars[i] = digit || ' '
    // Keep positions: trailing blanks are trimmed, inner blanks are kept so cell i stays cell i.
    commit(chars.join('').trimEnd())
    if (digit) focusCell(i + 1)
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i]?.trim()) {
      e.preventDefault()
      if (i > 0) {
        const chars = Array.from({ length }, (_, k) => code[k] ?? ' ')
        chars[i - 1] = ' '
        commit(chars.join('').trimEnd())
        focusCell(i - 1)
      }
    } else if (e.key === 'ArrowLeft') focusCell(i - 1)
    else if (e.key === 'ArrowRight') focusCell(i + 1)
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    e.preventDefault()
    commit(digits)
    focusCell(digits.length - 1)
  }

  return (
    <div ref={group} role="group" aria-label={groupLabel} onPaste={onPaste} className={cn('inline-flex gap-2', className)}>
      {Array.from({ length }, (_, i) => (
        <OtpCell
          key={i}
          aria-label={cellLabel(i)}
          value={code[i]?.trim() ?? ''}
          onChange={(v) => setDigit(i, v.slice(-1))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          invalid={invalid}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </div>
  )
}
