import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ForecastPoint } from '../lib/mockForecast'

interface ForecastChartProps {
  data: ForecastPoint[]
  unit?: string
}

export function ForecastChart({ data, unit = 'kg' }: ForecastChartProps) {
  return (
    <div style={{ width: '100%', height: 360 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" minTickGap={32} />
          <YAxis unit={` ${unit}`} width={70} />
          <Tooltip />
          <Legend />
          <Area
            dataKey="band"
            name="p10-p90"
            stroke="none"
            fill="#4f46e5"
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="history"
            name="History"
            stroke="#0f172a"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="p50"
            name="Forecast (p50)"
            stroke="#4f46e5"
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
