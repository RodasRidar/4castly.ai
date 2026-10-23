import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ParametersDrawer, type ParametersDrawerProps } from './ParametersDrawer'

const props: Omit<ParametersDrawerProps, 'onChange' | 'onRecalculate' | 'onOpenChange'> = {
  open: true,
  title: 'Parámetros del pronóstico',
  closeLabel: 'Cerrar',
  values: { horizon: '12', granularity: 'weekly', leadTime: 14, threshold: 4, style: 'brief' },
  horizon: { label: 'Horizonte', options: [{ value: '8', label: '8 semanas' }, { value: '12', label: '12 semanas' }, { value: '24', label: '24 semanas' }] },
  granularity: { label: 'Granularidad', options: [{ value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensual' }] },
  leadTime: { label: 'Tiempo de reposición', decrementLabel: 'Reducir reposición', incrementLabel: 'Aumentar reposición', unit: 'días', min: 1, max: 180 },
  threshold: { label: 'Umbral crítico', decrementLabel: 'Reducir umbral', incrementLabel: 'Aumentar umbral', unit: 'semanas', min: 1, max: 26 },
  style: { label: 'Estilo del asistente', options: [{ value: 'brief', label: 'Breve' }, { value: 'detailed', label: 'Detallado' }] },
  recalculateLabel: 'Recalcular',
}

function setup(over: Partial<ParametersDrawerProps> = {}) {
  const h = { onChange: vi.fn(), onRecalculate: vi.fn(), onOpenChange: vi.fn() }
  render(<ParametersDrawer {...props} {...h} {...over} />)
  return h
}

describe('ParametersDrawer', () => {
  it('is a named dialog with all controls reflecting values', async () => {
    setup()
    expect(await screen.findByRole('dialog', { name: props.title })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '12 semanas' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Semanal' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Breve' })).toBeChecked()
    expect(screen.getByRole('spinbutton', { name: 'Tiempo de reposición' })).toHaveAttribute('aria-valuenow', '14')
    expect(screen.getByRole('spinbutton', { name: 'Umbral crítico' })).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByRole('radiogroup', { name: 'Horizonte' })).toBeInTheDocument()
  })
  it('reports each field change with its key', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('radio', { name: '24 semanas' }))
    expect(h.onChange).toHaveBeenLastCalledWith('horizon', '24')
    await userEvent.click(screen.getByRole('radio', { name: 'Mensual' }))
    expect(h.onChange).toHaveBeenLastCalledWith('granularity', 'monthly')
    await userEvent.click(screen.getByRole('radio', { name: 'Detallado' }))
    expect(h.onChange).toHaveBeenLastCalledWith('style', 'detailed')
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar reposición' }))
    expect(h.onChange).toHaveBeenLastCalledWith('leadTime', 15)
    await userEvent.click(screen.getByRole('button', { name: 'Reducir umbral' }))
    expect(h.onChange).toHaveBeenLastCalledWith('threshold', 3)
  })
  it('recalculate fires onRecalculate', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Recalcular' }))
    expect(h.onRecalculate).toHaveBeenCalledTimes(1)
  })
  it('recalculating: disables controls and shows busy button', async () => {
    const h = setup({ recalculating: true })
    const btn = screen.getByRole('button', { name: 'Recalcular' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('radio', { name: '24 semanas' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aumentar reposición' })).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: '24 semanas' }))
    expect(h.onChange).not.toHaveBeenCalled()
  })
  it('closes with Escape through onOpenChange', async () => {
    const h = setup()
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(h.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
