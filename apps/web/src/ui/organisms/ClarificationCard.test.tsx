import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClarificationCard, type ClarificationCardProps } from './ClarificationCard'

const leadTime = {
  label: '¿Cuántos días tarda en llegar un pedido?',
  options: [
    { value: '7', label: '7 días' },
    { value: '14', label: '14 días' },
    { value: '30', label: '30 días' },
  ],
  other: { label: 'Otro', inputLabel: 'Días de reposición' },
}
const stockout = {
  label: '¿Has tenido quiebres de stock?',
  options: [
    { value: 'yes', label: 'Sí' },
    { value: 'no', label: 'No' },
    { value: 'unknown', label: 'No lo sé' },
  ],
}
const copy = { calculateLabel: 'Calcular pronóstico', skipLabel: 'Omitir y pronosticar ahora' }

function setup(props: Partial<ClarificationCardProps> = {}) {
  const h = { onLeadTimeChange: vi.fn(), onStockoutChange: vi.fn(), onCalculate: vi.fn(), onSkip: vi.fn() }
  render(
    <ClarificationCard leadTime={leadTime} leadTimeValue={null} stockout={stockout} stockoutValue={null} {...copy} {...h} {...props} />,
  )
  return h
}

describe('ClarificationCard', () => {
  it('shows only the lead time question by default', () => {
    setup()
    expect(screen.getByRole('group', { name: leadTime.label })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: stockout.label })).toBeNull()
  })
  it('shows the stockout question when requested', () => {
    setup({ showStockoutQuestion: true })
    expect(screen.getByRole('group', { name: stockout.label })).toBeInTheDocument()
  })
  it('reports answers', async () => {
    const h = setup({ showStockoutQuestion: true })
    await userEvent.click(screen.getByRole('button', { name: '14 días' }))
    await userEvent.click(screen.getByRole('button', { name: 'No lo sé' }))
    expect(h.onLeadTimeChange).toHaveBeenCalledWith('14')
    expect(h.onStockoutChange).toHaveBeenCalledWith('unknown')
  })
  it('calculate is disabled until all visible questions are answered', () => {
    setup()
    expect(screen.getByRole('button', { name: copy.calculateLabel })).toBeDisabled()
  })
  it('calculate is enabled with only lead time when the stockout question is hidden', async () => {
    const h = setup({ leadTimeValue: '14', stockoutValue: null })
    const calc = screen.getByRole('button', { name: copy.calculateLabel })
    expect(calc).toBeEnabled()
    await userEvent.click(calc)
    expect(h.onCalculate).toHaveBeenCalledTimes(1)
  })
  it('calculate needs the stockout answer when that question is visible', () => {
    setup({ showStockoutQuestion: true, leadTimeValue: '14', stockoutValue: null })
    expect(screen.getByRole('button', { name: copy.calculateLabel })).toBeDisabled()
  })
  it('calculate is enabled when both are answered', () => {
    setup({ showStockoutQuestion: true, leadTimeValue: '14', stockoutValue: 'no' })
    expect(screen.getByRole('button', { name: copy.calculateLabel })).toBeEnabled()
  })
  it('blank free text does not count as an answer', () => {
    setup({ leadTimeValue: '  ' })
    expect(screen.getByRole('button', { name: copy.calculateLabel })).toBeDisabled()
  })
  it('skip is always available', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: copy.skipLabel }))
    expect(h.onSkip).toHaveBeenCalledTimes(1)
  })
  it('submitting disables everything and shows the busy state on calculate', () => {
    setup({ leadTimeValue: '14', submitting: true })
    expect(screen.getByRole('button', { name: copy.calculateLabel })).toBeDisabled()
    expect(screen.getByRole('button', { name: copy.skipLabel })).toBeDisabled()
    expect(screen.getByRole('button', { name: '14 días' })).toBeDisabled()
  })
  it('renders an optional title', () => {
    setup({ title: 'Dos preguntas rápidas' })
    expect(screen.getByRole('heading', { name: 'Dos preguntas rápidas' })).toBeInTheDocument()
  })
})
