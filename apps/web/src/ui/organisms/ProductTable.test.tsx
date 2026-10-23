import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductTable, type ProductRow, type ProductTableProps } from './ProductTable'

const rows: ProductRow[] = [
  {
    code: 'PRQ-010130',
    name: 'Ácido cítrico 25 kg',
    abcClass: 'A',
    typicalDemand: 120,
    stock: 80,
    coverageWeeks: 3,
    risk: { level: 'critical', label: 'Crítico' },
    suggestedQuantity: 400,
    buyBefore: new Date('2026-11-02T00:00:00Z'),
    leadTimeDays: 21,
  },
  {
    code: 'PRQ-020044',
    name: 'Glicerina USP 200 kg',
    abcClass: 'B',
    typicalDemand: 40,
    stock: 500,
    coverageWeeks: 12,
    risk: { level: 'optimal', label: 'Óptimo' },
    suggestedQuantity: null,
    buyBefore: null,
    leadTimeDays: 30,
  },
]

const labels: ProductTableProps['labels'] = {
  caption: 'Productos y su riesgo de quiebre',
  columns: {
    name: 'Producto',
    abc: 'Clase ABC',
    demand: 'Demanda típica',
    stock: 'Stock actual',
    coverage: 'Cobertura',
    risk: 'Riesgo',
    suggested: 'Cantidad sugerida',
    buyBefore: 'Comprar antes de',
    leadTime: 'Tiempo de reposición',
  },
  units: { demand: 'u/sem', stock: 'u', coverage: 'sem', suggested: 'u', leadTime: 'días' },
  sortBy: (c) => `Ordenar por ${c}`,
  selectAll: 'Seleccionar todos',
  selectRow: (n) => `Seleccionar ${n}`,
  columnPicker: 'Columnas',
  columnPickerLabel: 'Columnas visibles',
  editLeadTime: (n) => `Editar tiempo de reposición de ${n}`,
  leadTimeInput: (n) => `Tiempo de reposición de ${n}`,
  savingText: 'Guardando…',
  errorText: 'No se pudo guardar',
  loading: 'Cargando productos',
  empty: { title: 'Ningún producto coincide', body: 'Prueba con otros filtros.' },
  error: { title: 'No pudimos cargar los productos', body: 'Intenta de nuevo.' },
}

function setup(over: Partial<ProductTableProps> = {}) {
  const props: ProductTableProps = {
    state: 'populated',
    mode: 'results',
    rows,
    labels,
    sort: null,
    onSortChange: vi.fn(),
    onOpenProduct: vi.fn(),
    ...over,
  }
  const view = render(<ProductTable {...props} />)
  return { props, ...view }
}

describe('ProductTable', () => {
  it('renders a semantic table with caption and results columns only', () => {
    setup()
    const table = screen.getByRole('table', { name: 'Productos y su riesgo de quiebre' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Producto',
      'Clase ABC',
      'Demanda típica',
      'Stock actual',
      'Cobertura',
      'Riesgo',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('PRQ-010130')).toBeInTheDocument()
  })
  it('scrolls horizontally inside a focusable region, not the page', () => {
    setup()
    const region = screen.getByRole('region', { name: 'Productos y su riesgo de quiebre' })
    expect(region).toHaveClass('overflow-x-auto')
    expect(region).toHaveAttribute('tabindex', '0')
  })
  it('opens a product from the name button', async () => {
    const { props } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Ácido cítrico 25 kg/ }))
    expect(props.onOpenProduct).toHaveBeenCalledWith('PRQ-010130')
  })
  it('opens a product with the keyboard (Enter)', async () => {
    const { props } = setup()
    screen.getByRole('button', { name: /Glicerina USP 200 kg/ }).focus()
    await userEvent.keyboard('{Enter}')
    expect(props.onOpenProduct).toHaveBeenCalledWith('PRQ-020044')
  })
  it('sort header reflects state and calls onSortChange', async () => {
    const { props } = setup({ sort: { column: 'risk', direction: 'asc' } })
    expect(screen.getByRole('columnheader', { name: /Riesgo/ })).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por Cobertura' }))
    expect(props.onSortChange).toHaveBeenCalledWith('coverage')
  })
  it('portfolio mode adds purchase columns and the editable lead time', async () => {
    const onLeadTimeChange = vi.fn()
    setup({ mode: 'portfolio', onLeadTimeChange })
    expect(screen.getByRole('columnheader', { name: /Cantidad sugerida/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Comprar antes de/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Tiempo de reposición/ })).toBeInTheDocument()
    expect(screen.getByText('400 u')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Editar tiempo de reposición de Ácido cítrico 25 kg/ }))
    const input = screen.getByRole('spinbutton', { name: 'Tiempo de reposición de Ácido cítrico 25 kg' })
    await userEvent.clear(input)
    await userEvent.type(input, '28{Enter}')
    expect(onLeadTimeChange).toHaveBeenCalledWith('PRQ-010130', 28)
  })
  it('does not show lead time editing in results mode', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Editar tiempo de reposición/ })).toBeNull()
  })
  it('selection: header checkbox is indeterminate with a partial selection and selects all', async () => {
    const onSelectionChange = vi.fn()
    const { rerender, props } = setup({ mode: 'portfolio', selectedCodes: ['PRQ-010130'], onSelectionChange })
    const header = screen.getByRole('checkbox', { name: 'Seleccionar todos' })
    expect(header).toHaveAttribute('aria-checked', 'mixed')
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ácido cítrico 25 kg' })).toBeChecked()
    await userEvent.click(header)
    expect(onSelectionChange).toHaveBeenCalledWith(['PRQ-010130', 'PRQ-020044'])
    rerender(<ProductTable {...props} mode="portfolio" selectedCodes={['PRQ-010130', 'PRQ-020044']} onSelectionChange={onSelectionChange} />)
    expect(screen.getByRole('checkbox', { name: 'Seleccionar todos' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }))
    expect(onSelectionChange).toHaveBeenLastCalledWith([])
  })
  it('selecting a row toggles it', async () => {
    const onSelectionChange = vi.fn()
    setup({ mode: 'portfolio', selectedCodes: [], onSelectionChange })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Glicerina USP 200 kg' }))
    expect(onSelectionChange).toHaveBeenCalledWith(['PRQ-020044'])
  })
  it('column picker hides and shows optional columns', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Columnas' }))
    const stock = await screen.findByRole('checkbox', { name: 'Stock actual' })
    expect(stock).toBeChecked()
    await userEvent.click(stock)
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Stock actual/ })).toBeNull())
    expect(screen.getByRole('columnheader', { name: /Producto/ })).toBeInTheDocument()
  })
  it('renders pagination when given and forwards page changes', async () => {
    const onPageChange = vi.fn()
    setup({ pagination: { page: 1, total: 3, pageText: 'Página 1 de 3', label: 'Paginación', prevLabel: 'Anterior', nextLabel: 'Siguiente', onPageChange } })
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
  it('loading shows skeleton rows and no data', () => {
    const { container } = setup({ state: 'loading', loadingRows: 4 })
    expect(screen.getByText('Cargando productos')).toBeInTheDocument()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(screen.queryByText('Ácido cítrico 25 kg')).toBeNull()
  })
  it('empty shows the empty state', () => {
    setup({ state: 'empty' })
    expect(screen.getByText('Ningún producto coincide')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('error shows the error state', () => {
    setup({ state: 'error' })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los productos')
  })
})
