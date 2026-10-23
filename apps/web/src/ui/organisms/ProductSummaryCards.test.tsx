import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductSummaryCards, type ProductSummaryCardsProps } from './ProductSummaryCards'

function props(over: Partial<ProductSummaryCardsProps> = {}): ProductSummaryCardsProps {
  return {
    state: 'populated',
    loadingLabel: 'Cargando resumen',
    stockout: {
      title: 'El stock se acaba el',
      date: new Date('2026-11-10T00:00:00Z'),
      description: 'Si la demanda sigue como se espera.',
      noRiskTitle: 'Sin riesgo de quiebre',
      noRiskBody: 'El stock alcanza durante todo el horizonte.',
    },
    purchase: {
      title: 'Compra recomendada',
      quantityLabel: 'Cantidad sugerida',
      quantity: 400,
      quantityUnit: 'u',
      buyBeforeLabel: 'Comprar antes de',
      buyBefore: new Date('2026-10-20T00:00:00Z'),
      leadTime: { label: 'Tiempo de reposición', value: 21, unit: 'días', min: 1, max: 120, onChange: vi.fn(), decrementLabel: 'Reducir tiempo de reposición', incrementLabel: 'Aumentar tiempo de reposición' },
      coverage: { label: 'Cobertura objetivo', value: 8, unit: 'sem', min: 1, max: 52, onChange: vi.fn(), decrementLabel: 'Reducir cobertura objetivo', incrementLabel: 'Aumentar cobertura objetivo' },
      noPurchaseText: 'No hace falta comprar por ahora.',
    },
    reliability: {
      title: 'Confiabilidad',
      level: 'medium',
      badgeLabel: 'Media',
      explanation: 'Hay historial suficiente, pero la demanda varía bastante.',
      detailToggleLabel: 'Ver detalle técnico',
      detail: <p>MAPE de validación: 18 %</p>,
    },
    ...over,
  }
}

describe('ProductSummaryCards', () => {
  it('populated shows the three cards', () => {
    render(<ProductSummaryCards {...props()} />)
    expect(screen.getByRole('region', { name: 'El stock se acaba el' })).toHaveTextContent('Si la demanda sigue como se espera.')
    expect(within(screen.getByRole('region', { name: 'El stock se acaba el' })).getByRole('time')).toHaveAttribute('datetime', '2026-11-10T00:00:00.000Z')
    const purchase = screen.getByRole('region', { name: 'Compra recomendada' })
    expect(purchase).toHaveTextContent('400 u')
    expect(screen.getByRole('region', { name: 'Confiabilidad' })).toHaveTextContent('Media')
  })
  it('lead time and coverage steppers call back', async () => {
    const p = props()
    render(<ProductSummaryCards {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar tiempo de reposición' }))
    expect(p.purchase.leadTime.onChange).toHaveBeenCalledWith(22)
    await userEvent.click(screen.getByRole('button', { name: 'Reducir cobertura objetivo' }))
    expect(p.purchase.coverage.onChange).toHaveBeenCalledWith(7)
  })
  it('technical detail is a disclosure, closed by default', async () => {
    render(<ProductSummaryCards {...props()} />)
    const toggle = screen.getByRole('button', { name: 'Ver detalle técnico' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/MAPE/)).toBeNull()
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/MAPE/)).toBeInTheDocument()
  })
  it('no-risk state replaces the date with the no-risk message', () => {
    render(<ProductSummaryCards {...props({ state: 'no-risk' })} />)
    expect(screen.getByText('Sin riesgo de quiebre')).toBeInTheDocument()
    expect(screen.getByText('El stock alcanza durante todo el horizonte.')).toBeInTheDocument()
    expect(screen.queryByRole('time')).toBeNull()
    expect(screen.getByText('No hace falta comprar por ahora.')).toBeInTheDocument()
  })
  it('loading shows skeletons and a busy group', () => {
    const { container } = render(<ProductSummaryCards {...props({ state: 'loading' })} />)
    expect(container.querySelectorAll('[data-shape]').length).toBeGreaterThan(0)
    expect(screen.getByText('Cargando resumen')).toBeInTheDocument()
    expect(screen.queryByText('Media')).toBeNull()
  })
})
