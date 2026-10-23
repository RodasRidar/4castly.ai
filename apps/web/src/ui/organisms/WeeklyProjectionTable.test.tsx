import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WeeklyProjectionTable, type WeeklyProjectionTableProps } from './WeeklyProjectionTable'

const rows = [
  { weekStart: new Date('2026-10-26T00:00:00Z'), low: 100, expected: 120, high: 150, projectedStock: 300, shortfall: 0, status: { level: 'optimal' as const, label: 'Cubierto' } },
  { weekStart: new Date('2026-11-02T00:00:00Z'), low: 100, expected: 130, high: 170, projectedStock: 20, shortfall: 0, status: { level: 'medium' as const, label: 'Ajustado' } },
  { weekStart: new Date('2026-11-09T00:00:00Z'), low: 110, expected: 140, high: 190, projectedStock: 0, shortfall: 35, status: { level: 'critical' as const, label: 'Faltante' } },
]

function props(over: Partial<WeeklyProjectionTableProps> = {}): WeeklyProjectionTableProps {
  return {
    state: 'populated',
    caption: 'Proyección semanal de Ácido cítrico 25 kg',
    columns: { week: 'Semana', low: 'Escenario bajo', expected: 'Escenario esperado', high: 'Escenario alto', stock: 'Stock proyectado', shortfall: 'Faltante', status: 'Estado' },
    unit: 'u',
    rows,
    scenario: { label: 'Escenario de compra', value: 'none', onValueChange: vi.fn(), options: [{ value: 'none', label: 'Sin nueva compra' }, { value: 'suggested', label: 'Con compra sugerida' }] },
    loadingLabel: 'Cargando proyección',
    empty: { title: 'Sin proyección', body: 'Todavía no hay semanas para mostrar.' },
    error: { title: 'No pudimos cargar la proyección', body: 'Intenta de nuevo.' },
    ...over,
  }
}

describe('WeeklyProjectionTable', () => {
  it('renders caption, columns and one row per week', () => {
    render(<WeeklyProjectionTable {...props()} />)
    const table = screen.getByRole('table', { name: 'Proyección semanal de Ácido cítrico 25 kg' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Semana',
      'Escenario bajo',
      'Escenario esperado',
      'Escenario alto',
      'Stock proyectado',
      'Faltante',
      'Estado',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(table).toHaveTextContent('35 u')
    expect(screen.getByText('Faltante', { selector: 'span' })).toBeInTheDocument()
  })
  it('status shows text with the badge, not color alone', () => {
    render(<WeeklyProjectionTable {...props()} />)
    expect(screen.getByText('Cubierto')).toBeInTheDocument()
    expect(screen.getByText('Ajustado')).toBeInTheDocument()
  })
  it('scenario toggle reflects value and notifies changes', async () => {
    const p = props()
    render(<WeeklyProjectionTable {...p} />)
    expect(screen.getByRole('radio', { name: 'Sin nueva compra' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Con compra sugerida' }))
    await waitFor(() => expect(p.scenario.onValueChange).toHaveBeenCalledWith('suggested'))
  })
  it('scrolls horizontally inside its own region', () => {
    render(<WeeklyProjectionTable {...props()} />)
    expect(screen.getByRole('region', { name: 'Proyección semanal de Ácido cítrico 25 kg' })).toHaveClass('overflow-x-auto')
  })
  it('loading shows skeletons', () => {
    const { container } = render(<WeeklyProjectionTable {...props({ state: 'loading' })} />)
    expect(container.querySelectorAll('[data-shape]').length).toBeGreaterThan(0)
    expect(screen.getByText('Cargando proyección')).toBeInTheDocument()
    expect(screen.queryByText('Cubierto')).toBeNull()
  })
  it('empty and error replace the table', () => {
    const { rerender } = render(<WeeklyProjectionTable {...props({ state: 'empty' })} />)
    expect(screen.getByText('Sin proyección')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    rerender(<WeeklyProjectionTable {...props({ state: 'error' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la proyección')
  })
})
