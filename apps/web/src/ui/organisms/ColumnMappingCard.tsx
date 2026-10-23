import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { Select } from '../atoms/Select'
import { Skeleton } from '../atoms/Skeleton'
import { FormField } from '../molecules/FormField'
import { InlineNotice } from '../molecules/InlineNotice'

export interface ColumnMappingRow {
  /** Stable key of the target field (e.g. "date"). */
  field: string
  /** Visible, localized name of the field (e.g. "Fecha"). */
  label: string
  optional?: boolean
  /** Source column mapped to this field, or null when the file has none. */
  column: string | null
  samples: readonly string[]
}

export type ColumnMapping = Record<string, string | null>

export interface ColumnMappingCardProps {
  mode: 'read' | 'edit'
  title: string
  rows: readonly ColumnMappingRow[]
  /** Source columns offered in edit mode. */
  columns: readonly string[]
  confirmLabel: string
  editLabel: string
  saveLabel: string
  cancelLabel: string
  /** Label of the "no column" option, also shown for unmapped optional rows in read mode. */
  emptyOptionLabel: string
  sheet?: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }
  warnings?: readonly string[]
  loading?: boolean
  error?: string
  emptyText?: string
  onConfirm?: () => void
  onEdit?: () => void
  onSave?: (mapping: ColumnMapping) => void
  onCancel?: () => void
  className?: string
}

const samplesText = (s: readonly string[]) => s.join(', ')

function EditRows({
  rows,
  columns,
  emptyOptionLabel,
  saveLabel,
  cancelLabel,
  onSave,
  onCancel,
}: Pick<ColumnMappingCardProps, 'rows' | 'columns' | 'emptyOptionLabel' | 'saveLabel' | 'cancelLabel' | 'onSave' | 'onCancel'>) {
  const [draft, setDraft] = useState<ColumnMapping>(() => Object.fromEntries(rows.map((r) => [r.field, r.column])))
  const options = columns.map((c) => ({ value: c, label: c }))
  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <FormField key={r.field} label={r.label}>
            {({ invalid: _invalid, ...control }) => (
              <Select
                {...control}
                options={options}
                emptyOption={r.optional ? emptyOptionLabel : undefined}
                value={draft[r.field] ?? ''}
                onValueChange={(v) => setDraft((d) => ({ ...d, [r.field]: v === '' ? null : v }))}
              />
            )}
          </FormField>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSave?.(draft)}>{saveLabel}</Button>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </>
  )
}

export function ColumnMappingCard({
  mode,
  title,
  rows,
  columns,
  confirmLabel,
  editLabel,
  saveLabel,
  cancelLabel,
  emptyOptionLabel,
  sheet,
  warnings,
  loading,
  error,
  emptyText,
  onConfirm,
  onEdit,
  onSave,
  onCancel,
  className,
}: ColumnMappingCardProps) {
  const body = loading ? (
    <div className="flex flex-col gap-3" data-testid="mapping-skeleton">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  ) : error ? (
    <p role="alert" className="text-body-md text-critical">
      {error}
    </p>
  ) : rows.length === 0 ? (
    <p className="text-body-md text-mute">{emptyText}</p>
  ) : mode === 'edit' ? (
    <EditRows
      rows={rows}
      columns={columns}
      emptyOptionLabel={emptyOptionLabel}
      saveLabel={saveLabel}
      cancelLabel={cancelLabel}
      onSave={onSave}
      onCancel={onCancel}
    />
  ) : (
    <ul className="flex flex-col divide-y divide-hairline">
      {rows.map((r) => (
        <li key={r.field} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="text-body-md font-medium text-ink sm:w-32 sm:shrink-0">{r.label}</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Icon icon={ArrowLeftRight} size="sm" className="self-center text-faint" />
            <span className={cn('text-body-md', r.column ? 'font-mono text-ink' : 'text-mute')}>{r.column ?? emptyOptionLabel}</span>
            {r.samples.length > 0 && <span className="min-w-0 truncate font-mono text-body-sm text-mute">{samplesText(r.samples)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )

  const actionable = !loading && !error && rows.length > 0
  return (
    <section
      data-testid="column-mapping-card"
      aria-busy={loading || undefined}
      className={cn('flex flex-col gap-4 rounded-lg border border-hairline bg-elevated p-5', className)}
    >
      <h2 className="text-body-lg font-medium text-ink">{title}</h2>
      {sheet && sheet.options.length > 1 && (
        <FormField label={sheet.label}>
          {({ invalid: _invalid, ...control }) => (
            <Select {...control} options={sheet.options} value={sheet.value} onValueChange={sheet.onChange} />
          )}
        </FormField>
      )}
      {body}
      {warnings && warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {warnings.map((w) => (
            <InlineNotice key={w} tone="warning">
              {w}
            </InlineNotice>
          ))}
        </div>
      )}
      {mode === 'read' && (loading || actionable) && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={loading}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onEdit} disabled={loading}>
            {editLabel}
          </Button>
        </div>
      )}
    </section>
  )
}
