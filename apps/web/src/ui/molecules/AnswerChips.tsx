import { useState } from 'react'
import { cn } from '../../lib/cn'
import { Chip } from '../atoms/Chip'
import { Input } from '../atoms/Input'

export interface AnswerOption {
  value: string
  label: string
}

export interface AnswerChipsProps {
  /** Accessible name of the group (the question). */
  label: string
  options: readonly AnswerOption[]
  /** Optional free-text answer: shows an "Otro" chip that reveals an inline input. */
  other?: { label: string; inputLabel: string; placeholder?: string }
  /** Selected preset value, typed free text, or null when unanswered. */
  value: string | null
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function AnswerChips({ label, options, other, value, onChange, disabled, className }: AnswerChipsProps) {
  const [otherActive, setOtherActive] = useState(() => !!other && !!value && !options.some((o) => o.value === value))
  const [text, setText] = useState(() => (otherActive ? (value ?? '') : ''))

  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {options.map((o) => (
        <Chip
          key={o.value}
          selectable
          selected={!otherActive && value === o.value}
          disabled={disabled}
          onClick={() => {
            setOtherActive(false)
            onChange(o.value)
          }}
        >
          {o.label}
        </Chip>
      ))}
      {other && (
        <>
          <Chip
            selectable
            selected={otherActive}
            disabled={disabled}
            onClick={() => {
              setOtherActive(true)
              onChange(text)
            }}
          >
            {other.label}
          </Chip>
          {otherActive && (
            <Input
              aria-label={other.inputLabel}
              placeholder={other.placeholder}
              value={text}
              disabled={disabled}
              autoFocus
              className="w-32"
              onChange={(e) => {
                setText(e.target.value)
                onChange(e.target.value)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
