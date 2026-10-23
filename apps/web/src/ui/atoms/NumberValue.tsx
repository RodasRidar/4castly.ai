import { cn } from '../../lib/cn'

interface NumberValueProps {
  value?: number | null
  /** Low–high range, rendered "280–310 u". */
  range?: [number, number]
  unit?: string
  locale?: string
  maximumFractionDigits?: number
  className?: string
}

export function NumberValue({ value, range, unit, locale = 'es', maximumFractionDigits = 1, className }: NumberValueProps) {
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits })
  let text: string
  if (range) text = `${fmt.format(range[0])}–${fmt.format(range[1])}`
  else if (value === null || value === undefined || Number.isNaN(value)) text = '—'
  else text = fmt.format(value)
  const showUnit = unit && (range || (value !== null && value !== undefined))
  return <span className={cn('font-mono whitespace-nowrap tabular-nums', className)}>{showUnit ? `${text} ${unit}` : text}</span>
}
