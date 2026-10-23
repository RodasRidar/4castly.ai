import type { FormEvent } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Input } from '../atoms/Input'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { ErrorState } from '../molecules/ErrorState'
import { FormField } from '../molecules/FormField'

export interface ProfileValues {
  name: string
  role: string
  email: string
  company: string
}

export interface ProfileFormProps {
  /** Accessible name of the form. */
  label: string
  values: ProfileValues
  fieldLabels: Record<keyof ProfileValues, string>
  /** Per-field error messages for the editable fields. */
  errors?: Partial<Record<'name' | 'role', string>>
  /** pristine: no actions; dirty: Descartar + Guardar; saving: Guardar loading; saved: confirmation text. */
  status?: 'pristine' | 'dirty' | 'saving' | 'saved'
  state?: 'ready' | 'loading' | 'error'
  saveLabel: string
  discardLabel: string
  savedText: string
  loadingLabel?: string
  errorTitle?: string
  errorBody?: string
  retryLabel?: string
  onRetry?: () => void
  onChange: (field: 'name' | 'role', value: string) => void
  onSubmit: () => void
  onDiscard: () => void
  className?: string
}

export function ProfileForm({
  label,
  values,
  fieldLabels,
  errors,
  status = 'pristine',
  state = 'ready',
  saveLabel,
  discardLabel,
  savedText,
  loadingLabel = '',
  errorTitle = '',
  errorBody = '',
  retryLabel = '',
  onRetry,
  onChange,
  onSubmit,
  onDiscard,
  className,
}: ProfileFormProps) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label={loadingLabel} aria-busy="true" className={cn('flex max-w-lg flex-col gap-5', className)}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9" />
          </div>
        ))}
        <VisuallyHidden>{loadingLabel}</VisuallyHidden>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <ErrorState
        className={className}
        title={errorTitle}
        body={errorBody}
        primaryAction={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        }
      />
    )
  }

  const saving = status === 'saving'
  const showActions = status === 'dirty' || saving
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!saving) onSubmit()
  }

  return (
    <form aria-label={label} onSubmit={submit} className={cn('flex max-w-lg flex-col gap-5', className)}>
      <FormField label={fieldLabels.name} error={errors?.name}>
        {({ invalid, ...control }) => <Input {...control} invalid={invalid} autoComplete="name" value={values.name} onChange={(e) => onChange('name', e.target.value)} />}
      </FormField>
      <FormField label={fieldLabels.role} error={errors?.role}>
        {({ invalid, ...control }) => <Input {...control} invalid={invalid} value={values.role} onChange={(e) => onChange('role', e.target.value)} />}
      </FormField>
      <FormField label={fieldLabels.email}>{(control) => <Input id={control.id} aria-describedby={control['aria-describedby']} readOnly value={values.email} />}</FormField>
      <FormField label={fieldLabels.company}>{(control) => <Input id={control.id} aria-describedby={control['aria-describedby']} readOnly value={values.company} />}</FormField>
      <div className="flex items-center gap-2">
        {showActions && (
          <>
            <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>
              {discardLabel}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saveLabel}
            </Button>
          </>
        )}
        <p role="status" className="text-body-md text-mute">
          {status === 'saved' ? savedText : ''}
        </p>
      </div>
    </form>
  )
}
