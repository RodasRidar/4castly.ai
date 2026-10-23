import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConfirmedDataLine } from './ConfirmedDataLine'

const props = { summaryLabel: 'Datos confirmados', toggleLabel: 'Ver detalle', hideLabel: 'Ocultar detalle' }

describe('ConfirmedDataLine', () => {
  it('is collapsed by default with the detail not rendered', () => {
    render(
      <ConfirmedDataLine {...props}>
        <p>142 productos</p>
      </ConfirmedDataLine>,
    )
    expect(screen.getByText('Datos confirmados')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Ver detalle' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('142 productos')).toBeNull()
  })
  it('expands and collapses with mouse and keyboard, wiring aria-controls', async () => {
    render(
      <ConfirmedDataLine {...props}>
        <p>142 productos</p>
      </ConfirmedDataLine>,
    )
    const toggle = screen.getByRole('button', { name: 'Ver detalle' })
    await userEvent.tab()
    expect(toggle).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const expanded = screen.getByRole('button', { name: 'Ocultar detalle' })
    expect(expanded).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByText('142 productos').closest('[id]') as HTMLElement
    expect(expanded).toHaveAttribute('aria-controls', region.id)
    await userEvent.click(expanded)
    expect(screen.queryByText('142 productos')).toBeNull()
  })
  it('keeps the same label when no hideLabel is given', async () => {
    render(
      <ConfirmedDataLine summaryLabel="Datos confirmados" toggleLabel="Ver detalle">
        <p>detalle</p>
      </ConfirmedDataLine>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toHaveAttribute('aria-expanded', 'true')
  })
  it('can start expanded', () => {
    render(
      <ConfirmedDataLine {...props} defaultExpanded>
        <p>142 productos</p>
      </ConfirmedDataLine>,
    )
    expect(screen.getByText('142 productos')).toBeInTheDocument()
  })
  it('has no toggle when there is no detail', () => {
    render(<ConfirmedDataLine {...props} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
