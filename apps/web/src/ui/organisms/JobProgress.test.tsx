import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JobProgress } from './JobProgress'

const steps = [
  { id: 'read', label: 'Leyendo archivo' },
  { id: 'cols', label: 'Identificando columnas' },
  { id: 'clean', label: 'Limpiando datos' },
  { id: 'ready', label: 'Listo para pronosticar' },
]
const statusLabels = { done: 'Completado', active: 'En curso', pending: 'Pendiente' }

describe('JobProgress', () => {
  it('stepper: renders an ordered list with done, active and pending steps', () => {
    render(<JobProgress label="Progreso del análisis" steps={steps} activeIndex={1} statusLabels={statusLabels} />)
    const list = screen.getByRole('list', { name: 'Progreso del análisis' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((i) => i.getAttribute('data-status'))).toEqual(['done', 'active', 'pending', 'pending'])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(within(items[0]).getByText('Completado')).toBeInTheDocument()
  })
  it('stepper: announces the active step politely', () => {
    const { rerender } = render(<JobProgress label="Progreso" steps={steps} activeIndex={0} statusLabels={statusLabels} />)
    const live = screen.getByTestId('job-progress-live')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('Leyendo archivo')
    rerender(<JobProgress label="Progreso" steps={steps} activeIndex={2} statusLabels={statusLabels} />)
    expect(live).toHaveTextContent('Limpiando datos')
  })
  it('stepper: all done when activeIndex is past the last step', () => {
    render(<JobProgress label="Progreso" steps={steps} activeIndex={4} statusLabels={statusLabels} />)
    for (const i of screen.getAllByRole('listitem')) expect(i).toHaveAttribute('data-status', 'done')
    expect(screen.getByTestId('job-progress-live')).toBeEmptyDOMElement()
  })
  it('simple loader: shows the status text without a list', () => {
    render(<JobProgress label="Progreso" text="Calculando pronósticos…" />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Calculando pronósticos…')
  })
  it('cancel is an optional inline text button', async () => {
    const onCancel = vi.fn()
    const { rerender } = render(<JobProgress label="P" text="Calculando…" cancelLabel="Cancelar" onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    rerender(<JobProgress label="P" text="Calculando…" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
