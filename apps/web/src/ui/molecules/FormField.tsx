import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface FormFieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
  invalid: boolean
}

export interface FormFieldProps {
  label: string
  /** Text of the optional tag, e.g. "(opcional)". */
  optionalText?: string
  hint?: string
  error?: string
  /** Override the generated control id. */
  id?: string
  className?: string
  /** Render prop: spread the received props onto the control (`<Input {...p} />`). */
  children: (control: FormFieldControlProps) => ReactNode
}

export function FormField({ label, optionalText, hint, error, id, className, children }: FormFieldProps) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-body-md font-medium text-ink">
        {label}
        {optionalText && <span className="ml-1.5 font-normal text-mute">{optionalText}</span>}
      </label>
      {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, invalid: !!error })}
      {hint && (
        <p id={hintId} className="text-body-sm text-mute">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-critical">
          {error}
        </p>
      )}
    </div>
  )
}
