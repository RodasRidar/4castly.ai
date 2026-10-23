import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ForecastChart, type ForecastChartProps } from './ForecastChart'

const points = [
  { date: '2026-09-01', label: '1 sep', history: 100 },
  { date: '2026-09-08', label: '8 sep', history: 120 },
  { date: '2026-09-15', label: '15 sep', history: 90, expected: 90, low: 90, high: 90 },
  { date: '2026-09-22', label: '22 sep', expected: 110, low: 80, high: 140 },
]

const base: ForecastChartProps = {
  state: 'populated',
  label: 'Demanda semanal agregada: historial y pronóstico',
  points,
  todayDate: '2026-09-15',
  stockoutDates: ['2026-09-08'],
  legend: { history: 'Historial', expected: 'Esperado', range: 'Rango probable', stockout: 'Faltante pasado', today: 'Hoy' },
  table: { caption: 'Demanda semanal', toggleLabel: 'Ver datos en tabla', columns: { date: 'Semana', history: 'Historial', expected: 'Esperado', low: 'Bajo', high: 'Alto' } },
  loadingLabel: 'Cargando gráfico',
  empty: { title: 'Sin datos', body: 'Aún no hay historial para mostrar.' },
  error: { title: 'No pudimos dibujar el gráfico', body: 'Intenta de nuevo.' },
  width: 600,
  height: 300,
  animate: false,
}

describe('ForecastChart', () => {
  it('exposes the chart as a labelled image inside a figure', () => {
    render(<ForecastChart {...base} />)
    expect(screen.getByRole('figure')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: base.label })).toBeInTheDocument()
  })
  it('renders an svg with only token colors', () => {
    const { container } = render(<ForecastChart {...base} />)
    expect(container.querySelector('svg.recharts-surface')).not.toBeNull()
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/)
    expect(container.innerHTML).toContain('var(--ink)')
  })
  it('legend text comes from props and series differ by more than color', () => {
    render(<ForecastChart {...base} />)
    const legend = screen.getByRole('list')
    expect(legend).toHaveTextContent('Rango probable')
    expect(legend).toHaveTextContent('Hoy')
    expect(legend).toHaveTextContent('Faltante pasado')
    // history is solid, expected is dashed
    const swatches = legend.querySelectorAll('svg [data-series]')
    const byName = Object.fromEntries([...swatches].map((s) => [s.getAttribute('data-series'), s.getAttribute('stroke-dasharray')]))
    expect(byName.history).toBeNull()
    expect(byName.expected).toBeTruthy()
  })
  it('data table alternative is toggleable and lists values', async () => {
    render(<ForecastChart {...base} />)
    expect(screen.queryByRole('table')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Ver datos en tabla' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const table = screen.getByRole('table', { name: 'Demanda semanal' })
    expect(table).toHaveTextContent('8 sep')
    expect(table).toHaveTextContent('140')
    expect(screen.getAllByRole('row')).toHaveLength(points.length + 1)
  })
  it('loading shows a skeleton and a busy figure', () => {
    const { container } = render(<ForecastChart {...base} state="loading" />)
    expect(container.querySelectorAll('[data-shape]').length).toBeGreaterThan(0)
    expect(screen.getByText('Cargando gráfico')).toBeInTheDocument()
    expect(container.querySelector('svg.recharts-surface')).toBeNull()
  })
  it('empty and error states replace the chart', () => {
    const { rerender } = render(<ForecastChart {...base} state="empty" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: base.label })).toBeNull()
    rerender(<ForecastChart {...base} state="error" />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos dibujar el gráfico')
  })
})
