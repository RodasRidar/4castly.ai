import type { ConversationDetail, MappedField, NormalizationPlan, PlanView } from '../../services/types'
import type { ColumnMappingRow } from '../../ui/organisms/ColumnMappingCard'

type Profile = NonNullable<NonNullable<ConversationDetail['upload']>['profile']>
type ProfileColumn = Profile['sheets'][number]['columns'][number]
type Separator = NormalizationPlan['quantity']['decimal_separator']

export type FieldMapping = Partial<Record<MappedField, string | null>>

/** Documented guess from sample values. Latin-American files are day-first unless a sample proves otherwise. */
export function inferDateFormat(samples: readonly string[]): string {
  if (samples.length === 0) return 'dd/mm/yyyy'
  if (samples.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) return 'yyyy-mm-dd'
  if (samples.every((s) => /^\d{4}-\d{2}$/.test(s))) return 'yyyy-mm'
  const parts = samples.map((s) => /^(\d{1,2})([/-])(\d{1,2})\2\d{4}$/.exec(s)).filter((m) => m !== null)
  if (parts.length > 0) {
    const sep = parts[0][2]
    const monthFirst = parts.some((m) => Number(m[3]) > 12) && !parts.some((m) => Number(m[1]) > 12)
    return monthFirst ? `mm${sep}dd${sep}yyyy` : `dd${sep}mm${sep}yyyy`
  }
  return 'dd/mm/yyyy'
}

/** The later separator wins when both appear; a lone separator followed by three digits reads as thousands. */
export function inferDecimalSeparator(samples: readonly string[], fallback: Separator = '.'): Separator {
  for (const s of samples) {
    const comma = s.lastIndexOf(',')
    const dot = s.lastIndexOf('.')
    if (comma >= 0 && dot >= 0) return comma > dot ? ',' : '.'
    const at = Math.max(comma, dot)
    if (at < 0) continue
    const decimals = s.length - at - 1
    const found: Separator = s[at] === ',' ? ',' : '.'
    if (decimals === 3) return found === ',' ? '.' : ','
    return found
  }
  return fallback
}

export function columnsOf(profile: Profile | null | undefined, sheet: string | null): readonly ProfileColumn[] {
  if (!profile) return []
  return (
    profile.sheets.find((s) => s.name === sheet)?.columns ?? profile.sheets.find((s) => s.columns.length > 0)?.columns ?? []
  )
}

export function planRows(view: PlanView, label: (field: MappedField) => string): ColumnMappingRow[] {
  return view.mappings.map((m) => ({ field: m.field, label: label(m.field), optional: !m.required, column: m.column, samples: m.samples }))
}

const ALWAYS_REQUIRED: MappedField[] = ['date', 'product_code', 'quantity']

/**
 * Builds the plan the API receives from the user's edits. Returns null when a required field is empty,
 * so the caller never submits a plan the worker would reject.
 */
export function applyMapping(
  view: PlanView,
  mapping: FieldMapping,
  sheet: string,
  profile: Profile | null | undefined,
): NormalizationPlan | null {
  const base = view.plan
  const baseColumn: Record<MappedField, string | null> = {
    date: base?.date?.column ?? null,
    product_code: base?.product_code.column ?? null,
    product_name: base?.product_name?.column ?? null,
    quantity: base?.quantity.column ?? null,
    stock: base?.stock?.column ?? null,
    unit: base?.unit.column ?? null,
  }
  const pick = (field: MappedField) => (field in mapping ? (mapping[field] ?? null) : baseColumn[field])
  const required = new Set<MappedField>([...ALWAYS_REQUIRED, ...view.mappings.filter((m) => m.required).map((m) => m.field)])
  for (const field of required) if (!pick(field)) return null

  const cols = columnsOf(profile, sheet)
  const samplesOf = (name: string) => cols.find((c) => c.name === name)?.samples ?? []

  const dateColumn = pick('date')!
  const quantityColumn = pick('quantity')!
  const separator =
    quantityColumn === base?.quantity.column && base
      ? base.quantity.decimal_separator
      : inferDecimalSeparator(samplesOf(quantityColumn), base?.quantity.decimal_separator ?? '.')
  const stockColumn = pick('stock')
  const nameColumn = pick('product_name')
  const unitColumn = pick('unit')

  return {
    version: 1,
    sheet,
    header_row: base?.header_row ?? 1,
    date: {
      column: dateColumn,
      format: dateColumn === base?.date?.column && base.date ? base.date.format : inferDateFormat(samplesOf(dateColumn)),
    },
    product_code: { column: pick('product_code')! },
    product_name: nameColumn ? { column: nameColumn } : null,
    quantity: { column: quantityColumn, decimal_separator: separator },
    stock: stockColumn ? { column: stockColumn, decimal_separator: separator } : null,
    unit: { column: unitColumn, default: base?.unit.default ?? 'u' },
  }
}

/**
 * The `needs_date_column` view has no provisional plan, so the client completes one around the chosen date:
 * product code and quantity come from the proposal's mappings or, failing that, the first text and number
 * columns of the sheet profile. Contract request: the API should return that provisional plan itself.
 */
export function buildDatePlan(view: PlanView, profile: Profile | null | undefined, dateColumn: string): NormalizationPlan | null {
  const sheet = view.selected_sheet ?? view.sheets[0]
  if (!sheet) return null
  const cols = columnsOf(profile, sheet).filter((c) => c.name !== dateColumn)
  const mapped = (field: MappedField) => view.mappings.find((m) => m.field === field)?.column ?? null
  const productCode = mapped('product_code') ?? cols.find((c) => c.inferred_type === 'text')?.name ?? null
  const quantity = mapped('quantity') ?? cols.find((c) => c.inferred_type === 'number')?.name ?? null
  const plan = applyMapping(view, { date: dateColumn, product_code: productCode, quantity, product_name: mapped('product_name') }, sheet, profile)
  const candidate = view.date_column_candidates.find((c) => c.column === dateColumn)
  if (plan?.date && candidate) plan.date = { column: dateColumn, format: inferDateFormat(candidate.samples) }
  return plan
}
