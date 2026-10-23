import { cn } from '../../lib/cn'
import {
  buildTable,
  legendEntries,
  type ChartLegendLabels,
  type ChartMessage,
  type ChartPoint,
  type ChartState,
  type ChartTableLabels,
} from './ForecastChart.helpers'
import { ChartFrame, ForecastCanvas } from './ForecastChart.parts'

export type { ChartLegendLabels, ChartMessage, ChartPoint, ChartState, ChartTableLabels }

export interface ForecastChartProps {
  state: ChartState
  /** Accessible name of the chart image (what it shows). */
  label: string
  points: ChartPoint[]
  /** `date` of the point that marks today (draws the "Hoy" reference line). */
  todayDate?: string
  /** Dates (point `date`) of past stockouts. */
  stockoutDates?: string[]
  /** All legend and range wording comes from here, e.g. range: "Rango probable". */
  legend: Omit<ChartLegendLabels, 'stock' | 'arrival' | 'projectedStockout'>
  table: Omit<ChartTableLabels, 'columns'> & { columns: Omit<ChartTableLabels['columns'], 'stock'> }
  loadingLabel: string
  empty: ChartMessage
  error: ChartMessage
  axisLabel?: string
  /** Fixed size escape hatch (tests, print); omit for a responsive chart. */
  width?: number
  height?: number
  /** Animations are always off under prefers-reduced-motion; pass false to disable them (tests). */
  animate?: boolean
  className?: string
}

/** Aggregate chart: history, expected, low/high range, past stockouts and "today". */
export function ForecastChart({ state, label, points, todayDate, stockoutDates, legend, table, loadingLabel, empty, error, axisLabel, width, height = 300, animate = true, className }: ForecastChartProps) {
  const { headers, rows } = buildTable(points, { ...table.columns }, false)
  return (
    <ChartFrame
      state={state}
      label={label}
      legend={legendEntries(legend, {})}
      loadingLabel={loadingLabel}
      empty={empty}
      error={error}
      tableToggleLabel={table.toggleLabel}
      tableCaption={table.caption}
      tableHeaders={headers}
      tableRows={rows}
      height={height}
      className={cn(className)}
    >
      <ForecastCanvas
        points={points}
        todayDate={todayDate}
        stockoutDates={stockoutDates}
        names={legend}
        axisLabels={{ demand: axisLabel }}
        width={width}
        height={height}
        animate={animate}
      />
    </ChartFrame>
  )
}
