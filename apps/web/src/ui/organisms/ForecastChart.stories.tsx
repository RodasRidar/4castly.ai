import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { ForecastChart, type ChartPoint } from './ForecastChart'

const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Obvious sample data: 12 weeks of history, 8 weeks of forecast around "today". */
function samplePoints(): ChartPoint[] {
  const start = Date.UTC(2026, 5, 1)
  return Array.from({ length: 20 }, (_, i) => {
    const d = new Date(start + i * 7 * 86_400_000)
    const base = 1200 + 180 * Math.sin(i / 2.5)
    const past = i <= 11
    return {
      date: d.toISOString().slice(0, 10),
      label: dayFmt.format(d),
      history: past ? Math.round(base) : null,
      expected: i >= 11 ? Math.round(base) : null,
      low: i >= 11 ? Math.round(base * (1 - 0.04 * (i - 10))) : null,
      high: i >= 11 ? Math.round(base * (1 + 0.05 * (i - 10))) : null,
    }
  })
}
const points = samplePoints()

const meta = {
  title: 'Organisms/ForecastChart',
  component: ForecastChart,
  args: {
    state: 'populated',
    label: 'Demanda semanal de todos los productos: historial y pronóstico',
    points,
    todayDate: points[11].date,
    stockoutDates: [points[4].date, points[8].date],
    legend: { history: 'Historial', expected: 'Esperado', range: 'Rango probable', stockout: 'Faltante pasado', today: 'Hoy' },
    table: {
      caption: 'Demanda semanal en unidades',
      toggleLabel: 'Ver datos en tabla',
      columns: { date: 'Semana del', history: 'Historial', expected: 'Esperado', low: 'Mínimo probable', high: 'Máximo probable' },
    },
    loadingLabel: 'Cargando gráfico',
    empty: { title: 'Aún no hay datos para graficar', body: 'Cuando el cálculo termine verás aquí la demanda esperada.' },
    error: { title: 'No pudimos mostrar el gráfico', body: 'Intenta de nuevo en unos minutos.', action: <Button variant="secondary">Reintentar</Button> },
    axisLabel: 'Unidades por semana',
    animate: false,
  },
} satisfies Meta<typeof ForecastChart>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const Mobile390: Story = { render: (args) => <div className="w-[390px]"><ForecastChart {...args} /></div> }
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const ErrorState: Story = { args: { state: 'error' } }
