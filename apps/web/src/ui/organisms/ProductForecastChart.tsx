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

export interface ProductForecastChartProps {
  state: ChartState
  /** Accessible name of the chart image (what it shows). */
  label: string
  points: ChartPoint[]
  todayDate?: string
  /** Dates (point `date`) of past stockouts. */
  stockoutDates?: string[]
  /** Date when the projected stock reaches zero; draws the stockout marker. */
  projectedStockoutDate?: string
  /** Date the suggested purchase arrives; draws the arrival marker. */
  arrivalDate?: string
  legend: ChartLegendLabels
  table: ChartTableLabels
  loadingLabel: string
  empty: ChartMessage
  error: ChartMessage
  demandAxisLabel?: string
  stockAxisLabel?: string
  /** Fixed size escape hatch (tests, print); omit for a responsive chart. */
  width?: number
  height?: number
  /** Animations are always off under prefers-reduced-motion; pass false to disable them (tests). */
  animate?: boolean
  className?: string
}

/** Product chart: aggregate series plus projected stock, purchase arrival and stockout markers. */
export function ProductForecastChart({
  state,
  label,
  points,
  todayDate,
  stockoutDates,
  projectedStockoutDate,
  arrivalDate,
  legend,
  table,
  loadingLabel,
  empty,
  error,
  demandAxisLabel,
  stockAxisLabel,
  width,
  height = 320,
  animate = true,
  className,
}: ProductForecastChartProps) {
  const { headers, rows } = buildTable(points, table.columns, true)
  return (
    <ChartFrame
      state={state}
      label={label}
      legend={legendEntries(legend, { stock: true, arrival: Boolean(arrivalDate), projectedStockout: Boolean(projectedStockoutDate) })}
      loadingLabel={loadingLabel}
      empty={empty}
      error={error}
      tableToggleLabel={table.toggleLabel}
      tableCaption={table.caption}
      tableHeaders={headers}
      tableRows={rows}
      height={height}
      className={className}
    >
      <ForecastCanvas
        points={points}
        todayDate={todayDate}
        stockoutDates={stockoutDates}
        showStock
        projectedStockoutDate={projectedStockoutDate}
        arrivalDate={arrivalDate}
        names={legend}
        axisLabels={{ demand: demandAxisLabel, stock: stockAxisLabel }}
        width={width}
        height={height}
        animate={animate}
      />
    </ChartFrame>
  )
}
