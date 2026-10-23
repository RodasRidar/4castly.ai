import { useEffect, useState, type ReactNode } from 'react'
import { NumberValue } from '../atoms/NumberValue'

/** One time bucket. `label` is already formatted by the container (locale, no week codes). */
export interface ChartPoint {
  /** Stable ISO date used as the category key. */
  date: string
  label: string
  history?: number | null
  expected?: number | null
  low?: number | null
  high?: number | null
  /** Projected stock (product chart only). */
  stock?: number | null
}

export interface ChartLegendLabels {
  history: string
  expected: string
  /** Plain-language range name, e.g. "Rango probable". */
  range: string
  /** Past stockouts, e.g. "Faltante pasado". */
  stockout: string
  /** "Hoy". */
  today: string
  stock?: string
  arrival?: string
  projectedStockout?: string
}

export interface ChartTableLabels {
  caption: string
  /** Text of the button that toggles the table alternative. */
  toggleLabel: string
  columns: { date: string; history: string; expected: string; low: string; high: string; stock?: string }
}

export interface ChartMessage {
  title: string
  body: string
  action?: ReactNode
}

export type ChartState = 'populated' | 'loading' | 'empty' | 'error'

export type SeriesKind = 'history' | 'expected' | 'range' | 'stock' | 'stockout' | 'today' | 'arrival' | 'projectedStockout'

/** Hook: true when the user asked for reduced motion. Safe where matchMedia is missing (jsdom). */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [reduced, setReduced] = useState(() => (supported ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!supported) return
    const mq = window.matchMedia(query)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [supported])
  return reduced
}

export function buildTable(points: ChartPoint[], columns: ChartTableLabels['columns'], withStock: boolean) {
  const headers = [columns.date, columns.history, columns.expected, columns.low, columns.high]
  if (withStock) headers.push(columns.stock ?? '')
  const rows = points.map((p) => {
    const cells: ReactNode[] = [
      p.label,
      <NumberValue key="h" value={p.history} maximumFractionDigits={0} />,
      <NumberValue key="e" value={p.expected} maximumFractionDigits={0} />,
      <NumberValue key="l" value={p.low} maximumFractionDigits={0} />,
      <NumberValue key="u" value={p.high} maximumFractionDigits={0} />,
    ]
    if (withStock) cells.push(<NumberValue key="s" value={p.stock} maximumFractionDigits={0} />)
    return { key: p.date, cells }
  })
  return { headers, rows }
}


export interface LegendEntry {
  kind: SeriesKind
  label: string
}

export function legendEntries(names: ChartLegendLabels, opts: { stock?: boolean; arrival?: boolean; projectedStockout?: boolean }): LegendEntry[] {
  const entries: LegendEntry[] = [
    { kind: 'history', label: names.history },
    { kind: 'expected', label: names.expected },
    { kind: 'range', label: names.range },
  ]
  if (opts.stock && names.stock) entries.push({ kind: 'stock', label: names.stock })
  entries.push({ kind: 'stockout', label: names.stockout }, { kind: 'today', label: names.today })
  if (opts.arrival && names.arrival) entries.push({ kind: 'arrival', label: names.arrival })
  if (opts.projectedStockout && names.projectedStockout) entries.push({ kind: 'projectedStockout', label: names.projectedStockout })
  return entries
}
