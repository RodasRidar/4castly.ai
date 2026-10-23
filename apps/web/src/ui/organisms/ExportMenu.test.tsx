import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportMenu, type ExportMenuProps } from './ExportMenu'

const labels = { triggerLabel: 'Exportar', allLabel: 'Excel: todo el resultado', selectionLabel: 'Excel: selección', productLabel: 'Excel: este producto' }

function setup(props: Partial<ExportMenuProps> = {}) {
  const h = { onExportAll: vi.fn(), onExportSelection: vi.fn(), onExportProduct: vi.fn() }
  render(<ExportMenu {...labels} {...h} {...props} />)
  return h
}

describe('ExportMenu', () => {
  it('is a menu button that opens with the keyboard', async () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Exportar' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.tab()
    expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })
  it('fires the handler of the chosen item and closes', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: labels.allLabel }))
    expect(h.onExportAll).toHaveBeenCalledTimes(1)
    expect(h.onExportSelection).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('shows items only when their handler is passed', async () => {
    setup({ onExportSelection: undefined, onExportProduct: undefined })
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent(labels.allLabel)
  })
  it('disables the selection item when nothing is selected', async () => {
    const h = setup({ selectionDisabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    const item = await screen.findByRole('menuitem', { name: labels.selectionLabel })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(item)
    expect(h.onExportSelection).not.toHaveBeenCalled()
  })
  it('selects an item with the keyboard', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await screen.findByRole('menu')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(h.onExportAll.mock.calls.length + h.onExportSelection.mock.calls.length + h.onExportProduct.mock.calls.length).toBe(1)
  })
  it('Escape closes and returns focus to the trigger', async () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Exportar' })
    await userEvent.click(trigger)
    await screen.findByRole('menu')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it('disabled trigger does not open', async () => {
    setup({ disabled: true })
    const trigger = screen.getByRole('button', { name: 'Exportar' })
    expect(trigger).toBeDisabled()
  })
  it('renders no trigger when there is nothing to export', () => {
    setup({ onExportAll: undefined, onExportSelection: undefined, onExportProduct: undefined })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
