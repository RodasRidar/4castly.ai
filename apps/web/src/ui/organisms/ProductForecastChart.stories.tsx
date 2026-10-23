import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { ProductForecastChart, type ProductForecastChartProps } from './ProductForecastChart'

const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Obvious sample data for "Ácido cítrico 25 kg": stock falls to zero, a purchase arrives later. */
function samplePoints(): ProductForecastChartProps['points'] {
  const start = Date.UTC(2026, 5, 1)
  let stock = 1400
  return Array.from({ length: 20 }, (_, i) => {
    const d = new Date(start + i * 7 * 86_400_000)
    const demand = Math.round(150 + 25 * Math.sin(i / 2))
    if (i >= 11) stock = Math.max(0, stock - demand)
    return {
      date: d.toISOString().slice(0, 10),
      label: dayFmt.format(d),
      history: i <= 11 ? demand : null,
      expected: i >= 11 ? demand : null,
      low: i >= 11 ? Math.round(demand * 0.85) : null,
      high: i >= 11 ? Math.round(demand * 1.2) : null,
      stock: i >= 11 ? stock : null,
    }
  })
}
const points = samplePoints()
const zero = points.find((p) => p.stock === 0)?.date ?? points[18].date

const args: ProductForecastChartProps = {
  state: 'populated',
  label: 'Ácido cítrico 25 kg: demanda, pronóstico y stock proyectado',
  points,
  todayDate: points[11].date,
  stockoutDates: [points[3].date],
  projectedStockoutDate: zero,
  arrivalDate: points[17].date,
  legend: {
    history: 'Historial',
    expected: 'Esperado',
    range: 'Rango probable',
    stockout: 'Faltante pasado',
    today: 'Hoy',
    stock: 'Stock proyectado',
    arrival: 'Llegada de la compra',
    projectedStockout: 'Se acaba el stock',
  },
  table: {
    caption: 'Pronóstico de Ácido cítrico 25 kg por semana',
    toggleLabel: 'Ver datos en tabla',
    columns: { date: 'Semana del', history: 'Historial', expected: 'Esperado', low: 'Mínimo probable', high: 'Máximo probable', stock: 'Stock proyectado' },
  },
  loadingLabel: 'Cargando gráfico',
  empty: { title: 'Sin historial para este producto', body: 'No hay movimientos suficientes para graficar.' },
  error: { title: 'No pudimos mostrar el gráfico', body: 'Intenta de nuevo en unos minutos.', action: <Button variant="secondary">Reintentar</Button> },
  demandAxisLabel: 'Demanda semanal',
  stockAxisLabel: 'Stock',
  animate: false,
}

const meta = { title: 'Organisms/ProductForecastChart', component: ProductForecastChart, args } satisfies Meta<typeof ProductForecastChart>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const WithoutPurchase: Story = { args: { arrivalDate: undefined } }
export const Mobile390: Story = { render: (a) => <div className="w-[390px]"><ProductForecastChart {...a} /></div> }
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const ErrorState: Story = { args: { state: 'error' } }
