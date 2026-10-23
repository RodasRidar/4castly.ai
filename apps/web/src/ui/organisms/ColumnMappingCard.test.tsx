import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColumnMappingCard, type ColumnMappingCardProps } from './ColumnMappingCard'

const rows = [
  { field: 'date', label: 'Fecha', column: 'Fecha', samples: ['02/01/2024', '03/01/2024'] },
  { field: 'sku', label: 'Producto', column: 'Código', samples: ['GLI-001', 'SOR-210'] },
  { field: 'out', label: 'Salidas', column: 'Salida', samples: ['120', '85'] },
  { field: 'stock', label: 'Stock', optional: true, column: null, samples: [] },
]
const copy = {
  title: 'Así entendí tu archivo',
  confirmLabel: 'Sí, es correcto',
  editLabel: 'Corregir',
  saveLabel: 'Guardar',
  cancelLabel: 'Cancelar',
  emptyOptionLabel: '— No tengo esta columna —',
  samplesLabel: 'Ejemplos',
}
const columns = ['Fecha', 'Código', 'Salida', 'Existencia']

function setup(props: Partial<ColumnMappingCardProps> = {}) {
  const handlers = { onConfirm: vi.fn(), onEdit: vi.fn(), onSave: vi.fn(), onCancel: vi.fn() }
  render(<ColumnMappingCard mode="read" rows={rows} columns={columns} {...copy} {...handlers} {...props} />)
  return handlers
}

describe('ColumnMappingCard', () => {
  it('read-only: lists field, mapped column and samples', () => {
    setup()
    expect(screen.getByRole('heading', { name: copy.title })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(within(items[1]).getByText('Producto')).toBeInTheDocument()
    expect(within(items[1]).getByText('Código')).toBeInTheDocument()
    expect(within(items[1]).getByText('GLI-001, SOR-210')).toHaveClass('font-mono')
    expect(within(items[3]).getByText(copy.emptyOptionLabel)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
  it('read-only: confirm and edit buttons fire', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: copy.confirmLabel }))
    await userEvent.click(screen.getByRole('button', { name: copy.editLabel }))
    expect(h.onConfirm).toHaveBeenCalledTimes(1)
    expect(h.onEdit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: copy.saveLabel })).toBeNull()
  })
  it('edit: one select per row, the empty option only on optional fields', () => {
    setup({ mode: 'edit' })
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
    expect(screen.getByRole('combobox', { name: 'Producto' })).toHaveValue('Código')
    expect(within(screen.getByRole('combobox', { name: 'Stock' })).getByRole('option', { name: copy.emptyOptionLabel })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Fecha' })).queryByRole('option', { name: copy.emptyOptionLabel })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Stock' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: copy.confirmLabel })).toBeNull()
  })
  it('edit: save returns the draft mapping and cancel fires', async () => {
    const h = setup({ mode: 'edit' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Stock' }), 'Existencia')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Salidas' }), 'Código')
    await userEvent.click(screen.getByRole('button', { name: copy.saveLabel }))
    expect(h.onSave).toHaveBeenCalledWith({ date: 'Fecha', sku: 'Código', out: 'Código', stock: 'Existencia' })
    await userEvent.click(screen.getByRole('button', { name: copy.cancelLabel }))
    expect(h.onCancel).toHaveBeenCalledTimes(1)
  })
  it('edit: saving null for an unmapped optional field', async () => {
    const h = setup({ mode: 'edit' })
    await userEvent.click(screen.getByRole('button', { name: copy.saveLabel }))
    expect(h.onSave).toHaveBeenCalledWith(expect.objectContaining({ stock: null }))
  })
  it('shows the sheet select only with several sheets', async () => {
    const onChange = vi.fn()
    const sheet = { label: 'Hoja', value: 'Kardex', options: [{ value: 'Kardex', label: 'Kardex' }, { value: 'Resumen', label: 'Resumen' }], onChange }
    const { unmount } = render(<ColumnMappingCard mode="read" rows={rows} columns={columns} {...copy} sheet={sheet} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Hoja' }), 'Resumen')
    expect(onChange).toHaveBeenCalledWith('Resumen')
    unmount()
    render(<ColumnMappingCard mode="read" rows={rows} columns={columns} {...copy} sheet={{ ...sheet, options: [sheet.options[0]!] }} />)
    expect(screen.queryByRole('combobox', { name: 'Hoja' })).toBeNull()
  })
  it('lists data warnings', () => {
    setup({ warnings: ['3 productos tienen poco historial', 'Hay 2 filas sin fecha'] })
    const warnings = screen.getAllByRole('status')
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toHaveTextContent('3 productos tienen poco historial')
  })
  it('loading: shows busy skeletons and disables actions', () => {
    setup({ loading: true })
    expect(screen.getByTestId('column-mapping-card')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('button', { name: copy.confirmLabel })).toBeDisabled()
  })
  it('empty: shows the empty text and no confirm', () => {
    setup({ rows: [], emptyText: 'No encontré columnas' })
    expect(screen.getByText('No encontré columnas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: copy.confirmLabel })).toBeNull()
  })
  it('error: shows the error', () => {
    setup({ error: 'No pude leer las columnas' })
    expect(screen.getByRole('alert')).toHaveTextContent('No pude leer las columnas')
    expect(screen.queryByRole('button', { name: copy.confirmLabel })).toBeNull()
  })
})
