import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BulkActionBar } from './BulkActionBar'

const base = { label: 'Acciones de selección', countText: '3 seleccionados', clearLabel: 'Limpiar', exportLabel: 'Exportar selección' }

describe('BulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<BulkActionBar {...base} count={0} onClear={() => {}} onExport={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('shows count text and both actions', async () => {
    const onClear = vi.fn()
    const onExport = vi.fn()
    render(<BulkActionBar {...base} count={3} onClear={onClear} onExport={onExport} />)
    expect(screen.getByRole('toolbar', { name: 'Acciones de selección' })).toBeInTheDocument()
    expect(screen.getByText('3 seleccionados')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Exportar selección' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
  })
  it('uses no primary button', () => {
    render(<BulkActionBar {...base} count={2} onClear={() => {}} onExport={() => {}} />)
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveAttribute('data-variant', 'primary')
  })
})
