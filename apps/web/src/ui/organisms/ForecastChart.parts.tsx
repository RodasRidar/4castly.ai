import { ChartLine } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../../lib/cn'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { EmptyState } from '../molecules/EmptyState'
import { ErrorState } from '../molecules/ErrorState'
import { usePrefersReducedMotion, type ChartLegendLabels, type ChartMessage, type ChartPoint, type ChartState, type LegendEntry, type SeriesKind } from './ForecastChart.helpers'

/* ---------- legend ---------- */

function Swatch({ kind }: { kind: SeriesKind }) {
  const common = { 'data-series': kind } as const
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true" focusable="false" className="shrink-0">
      {kind === 'history' && <line {...common} x1="0" y1="6" x2="28" y2="6" stroke="var(--ink)" strokeWidth="2" />}
      {kind === 'expected' && <line {...common} x1="0" y1="6" x2="28" y2="6" stroke="var(--ink)" strokeWidth="2" strokeDasharray="6 4" />}
      {kind === 'stock' && (
        <line {...common} x1="0" y1="6" x2="28" y2="6" stroke="var(--body)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
      )}
      {kind === 'range' && <rect {...common} x="0" y="1" width="28" height="10" fill="var(--mute)" fillOpacity="0.18" />}
      {kind === 'today' && <line {...common} x1="14" y1="0" x2="14" y2="12" stroke="var(--mute)" strokeWidth="1.5" strokeDasharray="3 3" />}
      {kind === 'stockout' && <path {...common} d="M14 0 L20 6 L14 12 L8 6 Z" fill="var(--critical-accent)" stroke="var(--elevated)" />}
      {kind === 'arrival' && <rect {...common} x="9" y="1" width="10" height="10" fill="var(--ink)" stroke="var(--elevated)" />}
      {kind === 'projectedStockout' && (
        <path {...common} d="M8 1 L20 11 M20 1 L8 11" stroke="var(--critical-accent)" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}
    </svg>
  )
}

export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-body">
      {entries.map((e) => (
        <li key={e.kind} className="inline-flex items-center gap-2">
          <Swatch kind={e.kind} />
          {e.label}
        </li>
      ))}
    </ul>
  )
}

/* ---------- table alternative ---------- */

export function ChartDataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <div tabIndex={0} role="region" aria-label={caption} className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full min-w-max text-body-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline">
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-left font-medium text-mute">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-hairline last:border-b-0">
              {r.cells.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-2 text-left font-normal text-ink">
                    {c}
                  </th>
                ) : (
                  <td key={i} className="px-3 py-2 text-right text-ink">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- frame (states, figure, legend, table toggle) ---------- */

interface ChartFrameProps {
  state: ChartState
  /** Accessible name of the chart image. */
  label: string
  legend: LegendEntry[]
  loadingLabel: string
  empty: ChartMessage
  error: ChartMessage
  tableToggleLabel: string
  tableCaption: string
  tableHeaders: string[]
  tableRows: { key: string; cells: ReactNode[] }[]
  height: number
  className?: string
  children: ReactNode
}

export function ChartFrame({
  state,
  label,
  legend,
  loadingLabel,
  empty,
  error,
  tableToggleLabel,
  tableCaption,
  tableHeaders,
  tableRows,
  height,
  className,
  children,
}: ChartFrameProps) {
  const [open, setOpen] = useState(false)
  const tableId = useId()
  const box = 'rounded-lg border border-hairline bg-elevated'
  if (state === 'loading') {
    return (
      <div aria-busy="true" className={cn(box, 'p-4', className)}>
        <div style={{ height }}>
          <Skeleton shape="block" className="h-full" />
        </div>
        <VisuallyHidden>{loadingLabel}</VisuallyHidden>
      </div>
    )
  }
  if (state === 'empty') {
    return (
      <div className={cn(box, className)}>
        <EmptyState icon={ChartLine} title={empty.title} body={empty.body} action={empty.action} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className={cn(box, className)}>
        <ErrorState title={error.title} body={error.body} primaryAction={error.action} />
      </div>
    )
  }
  return (
    <figure className={cn(box, 'm-0 flex flex-col gap-3 p-4', className)}>
      <div role="img" aria-label={label} className="min-w-0">
        {children}
      </div>
      <ChartLegend entries={legend} />
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={tableId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md text-body-sm text-ink underline underline-offset-[3px]"
        >
          {tableToggleLabel}
        </button>
      </div>
      <div id={tableId}>{open && <ChartDataTable caption={tableCaption} headers={tableHeaders} rows={tableRows} />}</div>
    </figure>
  )
}

/* ---------- canvas ---------- */

function DiamondMarker({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return <path d={`M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z`} fill="var(--critical-accent)" stroke="var(--elevated)" strokeWidth={1.5} />
}
function CrossMarker({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return <path d={`M${cx - 6} ${cy - 6} L${cx + 6} ${cy + 6} M${cx + 6} ${cy - 6} L${cx - 6} ${cy + 6}`} stroke="var(--critical-accent)" strokeWidth={3} strokeLinecap="round" fill="none" />
}
function SquareMarker({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="var(--ink)" stroke="var(--elevated)" strokeWidth={1.5} />
}

const tick = { fill: 'var(--mute)', fontSize: 12 }
const fmt = (n: number) => new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(n)

export interface ForecastCanvasProps {
  points: ChartPoint[]
  todayDate?: string
  stockoutDates?: string[]
  /** Product chart extras. */
  showStock?: boolean
  projectedStockoutDate?: string
  arrivalDate?: string
  names: ChartLegendLabels
  /** Optional axis captions, e.g. "Unidades por semana". */
  axisLabels?: { demand?: string; stock?: string }
  width?: number
  height: number
  animate: boolean
}

export function ForecastCanvas({
  points,
  todayDate,
  stockoutDates = [],
  showStock = false,
  projectedStockoutDate,
  arrivalDate,
  names,
  axisLabels,
  width,
  height,
  animate,
}: ForecastCanvasProps) {
  const reduced = usePrefersReducedMotion()
  const anim = animate && !reduced
  const byDate = new Map(points.map((p) => [p.date, p]))
  const data = points.map((p) => ({
    ...p,
    band: typeof p.low === 'number' && typeof p.high === 'number' ? ([p.low, p.high] as [number, number]) : null,
  }))
  const chart = (
    <ComposedChart data={data} width={width} height={height} margin={{ top: 20, right: showStock ? 8 : 12, bottom: 4, left: 0 }}>
      <CartesianGrid stroke="var(--hairline)" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={(d: string) => byDate.get(d)?.label ?? d}
        tick={tick}
        tickLine={false}
        axisLine={{ stroke: 'var(--hairline)' }}
        minTickGap={24}
        interval="preserveStartEnd"
      />
      <YAxis
        yAxisId="demand"
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={48}
        tickFormatter={(v: number) => fmt(v)}
        label={axisLabels?.demand ? { value: axisLabels.demand, angle: -90, position: 'insideLeft', fill: 'var(--mute)', fontSize: 12 } : undefined}
      />
      {showStock && (
        <YAxis
          yAxisId="stock"
          orientation="right"
          tick={tick}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => fmt(v)}
          label={axisLabels?.stock ? { value: axisLabels.stock, angle: 90, position: 'insideRight', fill: 'var(--mute)', fontSize: 12 } : undefined}
        />
      )}
      <Tooltip
        labelFormatter={(d) => byDate.get(String(d))?.label ?? String(d)}
        formatter={(value) => (Array.isArray(value) ? value.map((v) => fmt(Number(v))).join('–') : typeof value === 'number' ? fmt(value) : String(value ?? ''))}
        contentStyle={{ background: 'var(--elevated)', border: '1px solid var(--hairline)', borderRadius: 8, color: 'var(--ink)', fontSize: 13 }}
        labelStyle={{ color: 'var(--ink)' }}
        itemStyle={{ color: 'var(--body)' }}
        cursor={{ stroke: 'var(--hairline)' }}
      />
      <Area
        yAxisId="demand"
        dataKey="band"
        name={names.range}
        stroke="none"
        fill="var(--mute)"
        fillOpacity={0.18}
        isAnimationActive={anim}
        connectNulls={false}
      />
      <Line
        yAxisId="demand"
        dataKey="history"
        name={names.history}
        stroke="var(--ink)"
        strokeWidth={2}
        dot={false}
        isAnimationActive={anim}
        connectNulls={false}
      />
      <Line
        yAxisId="demand"
        dataKey="expected"
        name={names.expected}
        stroke="var(--ink)"
        strokeWidth={2}
        strokeDasharray="6 4"
        dot={false}
        isAnimationActive={anim}
        connectNulls={false}
      />
      {showStock && (
        <Line
          yAxisId="stock"
          dataKey="stock"
          name={names.stock}
          stroke="var(--body)"
          strokeWidth={2}
          strokeDasharray="1 4"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={anim}
          connectNulls={false}
        />
      )}
      {todayDate && (
        <ReferenceLine
          yAxisId="demand"
          x={todayDate}
          stroke="var(--mute)"
          strokeDasharray="4 4"
          label={{ value: names.today, position: 'top', fill: 'var(--mute)', fontSize: 12 }}
        />
      )}
      {stockoutDates.map((d) => (
        <ReferenceDot key={d} yAxisId="demand" x={d} y={byDate.get(d)?.history ?? 0} ifOverflow="extendDomain" shape={DiamondMarker} />
      ))}
      {showStock && arrivalDate && (
        <ReferenceDot yAxisId="stock" x={arrivalDate} y={byDate.get(arrivalDate)?.stock ?? 0} ifOverflow="extendDomain" shape={SquareMarker} />
      )}
      {showStock && projectedStockoutDate && (
        <ReferenceDot yAxisId="stock" x={projectedStockoutDate} y={byDate.get(projectedStockoutDate)?.stock ?? 0} ifOverflow="extendDomain" shape={CrossMarker} />
      )}
    </ComposedChart>
  )
  if (width) return chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart}
    </ResponsiveContainer>
  )
}

