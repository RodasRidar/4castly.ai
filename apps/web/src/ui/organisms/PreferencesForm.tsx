import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { SegmentedControl } from '../atoms/SegmentedControl'
import { Select, type SelectOption } from '../atoms/Select'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { ErrorState } from '../molecules/ErrorState'
import { FormField } from '../molecules/FormField'

export interface PreferencesValues {
  theme: string
  language: string
  timezone: string
  assistantStyle: string
}

export interface PreferencesFormProps {
  /** Accessible name of the form. */
  label: string
  values: PreferencesValues
  fieldLabels: Record<keyof PreferencesValues, string>
  themeOptions: SelectOption[]
  languageOptions: SelectOption[]
  timezoneOptions: SelectOption[]
  assistantStyleOptions: SelectOption[]
  /** Note under Idioma about the assistant's language. */
  languageNote: string
  /** Autosave: fires once per changed field. */
  onChange: (field: keyof PreferencesValues, value: string) => void
  saveState?: 'idle' | 'saving' | 'saved'
  savingText?: string
  savedText?: string
  state?: 'ready' | 'loading' | 'error'
  loadingLabel?: string
  errorTitle?: string
  errorBody?: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}

export function PreferencesForm({
  label,
  values,
  fieldLabels,
  themeOptions,
  languageOptions,
  timezoneOptions,
  assistantStyleOptions,
  languageNote,
  onChange,
  saveState = 'idle',
  savingText = '',
  savedText = '',
  state = 'ready',
  loadingLabel = '',
  errorTitle = '',
  errorBody = '',
  retryLabel = '',
  onRetry,
  className,
}: PreferencesFormProps) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label={loadingLabel} aria-busy="true" className={cn('flex max-w-lg flex-col gap-5', className)}>
        {[0, 1, 2].map((i) => (
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
  return (
    // A div, not a <form>: autosave needs no submit, and Radix RadioGroup measures its size inside forms.
    <div role="group" aria-label={label} className={cn('flex max-w-lg flex-col gap-5', className)}>
      <div className="flex flex-col gap-1.5">
        <span className="text-body-md font-medium text-ink">
          {fieldLabels.theme}
        </span>
        <SegmentedControl
          aria-label={fieldLabels.theme}
          className="self-start"
          options={themeOptions}
          value={values.theme}
          onValueChange={(v) => onChange('theme', v)}
        />
      </div>
      <FormField label={fieldLabels.language} hint={languageNote}>
        {({ invalid, ...control }) => (
          <Select {...control} invalid={invalid} options={languageOptions} value={values.language} onValueChange={(v) => onChange('language', v)} />
        )}
      </FormField>
      <FormField label={fieldLabels.timezone}>
        {({ invalid, ...control }) => (
          <Select {...control} invalid={invalid} options={timezoneOptions} value={values.timezone} onValueChange={(v) => onChange('timezone', v)} />
        )}
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-body-md font-medium text-ink">{fieldLabels.assistantStyle}</span>
        <SegmentedControl
          aria-label={fieldLabels.assistantStyle}
          className="self-start"
          options={assistantStyleOptions}
          value={values.assistantStyle}
          onValueChange={(v) => onChange('assistantStyle', v)}
        />
      </div>
      <p role="status" className="min-h-5 text-body-md text-mute">
        {saveState === 'saving' ? savingText : saveState === 'saved' ? savedText : ''}
      </p>
    </div>
  )
}
