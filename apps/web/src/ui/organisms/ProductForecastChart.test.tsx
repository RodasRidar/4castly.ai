import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ProductForecastChart, type ProductForecastChartProps } from './ProductForecastChart'

const points = [
  { date: '2026-09-01', label: '1 sep', history: 40 },
  { date: '2026-09-08', label: '8 sep', history: 44, stock: 300 },
  { date: '2026-09-15', label: '15 sep', history: 42, expected: 42, low: 42, high: 42, stock: 260 },
  { date: '2026-09-22', label: '22 sep', expected: 50, low: 38, high: 66, stock: 200 },
  { date: '2026-09-29', label: '29 sep', expected: 52, low: 40, high: 70, stock: 90 },
]

const base: ProductForecastChartProps = {
  state: 'populated',
  label: 'Ácido cítrico 25 kg: demanda, pronóstico y stock proyectado',
  points,
  todayDate: '2026-09-15',
  stockoutDates: ['2026-09-08'],
  projectedStockoutDate: '2026-09-29',
  arrivalDate: '2026-09-22',
  legend: {
    history: 'Historial',
    expected: 'Esperado',
    range: 'Rango probable',
    stockout: 'Faltante pasado',
    today: 'Hoy',
    stock: 'Stock proyectado',
    arrival: 'Llegada de compra',
    projectedStockout: 'Quiebre previsto',
  },
  table: { caption: 'Pronóstico del producto', toggleLabel: 'Ver datos en tabla', columns: { date: 'Semana', history: 'Historial', expected: 'Esperado', low: 'Bajo', high: 'Alto', stock: 'Stock proyectado' } },
  loadingLabel: 'Cargando gráfico',
  empty: { title: 'Sin datos', body: 'No hay historial.' },
  error: { title: 'No pudimos dibujar el gráfico', body: 'Intenta de nuevo.' },
  width: 600,
  height: 300,
  animate: false,
}

describe('ProductForecastChart', () => {
  it('is a figure with a labelled image and token-only colors', () => {
    const { container } = render(<ProductForecastChart {...base} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: base.label })).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/)
    expect(container.innerHTML).toContain('var(--critical-accent)')
  })
  it('legend includes stock, arrival and projected stockout', () => {
    render(<ProductForecastChart {...base} />)
    const legend = screen.getByRole('list')
    for (const t of ['Stock proyectado', 'Llegada de compra', 'Quiebre previsto', 'Rango probable']) expect(legend).toHaveTextContent(t)
  })
  it('omits arrival and projected stockout entries when absent', () => {
    render(<ProductForecastChart {...base} arrivalDate={undefined} projectedStockoutDate={undefined} />)
    const legend = screen.getByRole('list')
    expect(legend).not.toHaveTextContent('Llegada de compra')
    expect(legend).not.toHaveTextContent('Quiebre previsto')
  })
  it('table alternative includes projected stock', async () => {
    render(<ProductForecastChart {...base} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver datos en tabla' }))
    const table = screen.getByRole('table', { name: 'Pronóstico del producto' })
    expect(table).toHaveTextContent('Stock proyectado')
    expect(table).toHaveTextContent('300')
  })
  it('handles loading, empty and error', () => {
    const { rerender, container } = render(<ProductForecastChart {...base} state="loading" />)
    expect(container.querySelectorAll('[data-shape]').length).toBeGreaterThan(0)
    rerender(<ProductForecastChart {...base} state="empty" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    rerender(<ProductForecastChart {...base} state="error" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
