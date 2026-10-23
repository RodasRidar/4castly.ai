import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberValue } from '../atoms/NumberValue'
import { KpiCard } from './KpiCard'

describe('KpiCard', () => {
  it('default state shows label, value, caption and link', () => {
    render(
      <KpiCard label="Compra sugerida" value={<NumberValue range={[280, 310]} unit="u" />} caption="próximos 90 días" linkLabel="Ver detalle" href="#detalle" />,
    )
    const card = screen.getByRole('group', { name: 'Compra sugerida' })
    expect(card).toHaveTextContent('280–310 u')
    expect(screen.getByText('próximos 90 días')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', '#detalle')
    expect(card).not.toHaveAttribute('aria-busy')
  })
  it('loading state shows skeletons and hides the value', () => {
    const { container } = render(<KpiCard label="Compra sugerida" state="loading" loadingLabel="Cargando" value="99" />)
    expect(screen.getByRole('group', { name: 'Compra sugerida' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('[data-shape]').length).toBeGreaterThan(0)
    expect(screen.queryByText('99')).toBeNull()
    expect(screen.getByText('Cargando')).toBeInTheDocument()
  })
  it('empty state shows a dash', () => {
    render(<KpiCard label="Compra sugerida" state="empty" value="99" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('99')).toBeNull()
  })
  it('omits caption and link when absent', () => {
    render(<KpiCard label="Riesgo" value="3" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
