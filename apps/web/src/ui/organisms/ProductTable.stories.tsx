import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button } from '../atoms/Button'
import { ProductTable, type ProductColumnId, type ProductRow, type ProductSort, type ProductTableLabels, type ProductTableProps } from './ProductTable'

const labels: ProductTableLabels = {
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
  selectAll: 'Seleccionar todos los productos de la página',
  selectRow: (n) => `Seleccionar ${n}`,
  columnPicker: 'Columnas',
  columnPickerLabel: 'Columnas visibles',
  editLeadTime: (n) => `Editar tiempo de reposición de ${n}`,
  leadTimeInput: (n) => `Tiempo de reposición de ${n}`,
  savingText: 'Guardando…',
  errorText: 'No se pudo guardar',
  loading: 'Cargando productos',
  empty: { title: 'Ningún producto coincide con los filtros', body: 'Prueba con otra búsqueda o restablece los filtros.', action: <Button variant="secondary">Restablecer filtros</Button> },
  error: { title: 'No pudimos cargar los productos', body: 'Intenta de nuevo en unos minutos.', action: <Button variant="secondary">Reintentar</Button> },
}

const rows: ProductRow[] = [
  { code: 'PRQ-010130', name: 'Ácido cítrico 25 kg', abcClass: 'A', typicalDemand: 120, stock: 80, coverageWeeks: 3, risk: { level: 'critical', label: 'Crítico' }, suggestedQuantity: 400, buyBefore: new Date('2026-11-02T00:00:00Z'), leadTimeDays: 21 },
  { code: 'PRQ-020044', name: 'Glicerina USP 200 kg', abcClass: 'B', typicalDemand: 40, stock: 500, coverageWeeks: 12, risk: { level: 'optimal', label: 'Óptimo' }, suggestedQuantity: null, buyBefore: null, leadTimeDays: 30 },
  { code: 'PRQ-030217', name: 'Bicarbonato de sodio 50 kg', abcClass: 'A', typicalDemand: 75, stock: 210, coverageWeeks: 6, risk: { level: 'medium', label: 'Medio' }, suggestedQuantity: 150, buyBefore: new Date('2026-11-20T00:00:00Z'), leadTimeDays: 14 },
  { code: 'PRQ-040005', name: 'Propilenglicol 20 L', abcClass: 'C', typicalDemand: 12, stock: 90, coverageWeeks: 8, risk: { level: 'optimal', label: 'Óptimo' }, suggestedQuantity: null, buyBefore: null, leadTimeDays: 30, leadTimeStatus: 'saving' },
]

const base: ProductTableProps = { state: 'populated', mode: 'results', rows, labels, sort: null, onSortChange: () => {}, onOpenProduct: () => {} }

const meta = { title: 'Organisms/ProductTable', component: ProductTable, args: base } satisfies Meta<typeof ProductTable>
export default meta
type Story = StoryObj<typeof meta>

const pagination = { page: 1, total: 3, pageText: 'Página 1 de 3', label: 'Paginación de productos', prevLabel: 'Página anterior', nextLabel: 'Página siguiente', onPageChange: () => {} }

export const Results: Story = { args: { pagination, sort: { column: 'risk', direction: 'asc' } } }
export const Mobile390: Story = { args: { pagination }, render: (a) => <div className="w-[390px]"><ProductTable {...a} /></div> }
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const ErrorState: Story = { args: { state: 'error' } }

function PortfolioTable() {
  const [selected, setSelected] = useState<string[]>(['PRQ-010130'])
  const [sort, setSort] = useState<ProductSort | null>({ column: 'buyBefore', direction: 'asc' })
  const [data, setData] = useState(rows)
  const [visible, setVisible] = useState<ProductColumnId[] | undefined>(undefined)
  return (
    <ProductTable
      {...base}
      mode="portfolio"
      rows={data}
      sort={sort}
      onSortChange={(column) => setSort((s) => ({ column, direction: s?.column === column && s.direction === 'asc' ? 'desc' : 'asc' }))}
      selectedCodes={selected}
      onSelectionChange={setSelected}
      onLeadTimeChange={(code, days) => setData((d) => d.map((r) => (r.code === code ? { ...r, leadTimeDays: days, leadTimeStatus: 'idle' } : r)))}
      visibleColumns={visible}
      onVisibleColumnsChange={setVisible}
      pagination={pagination}
    />
  )
}
export const Portfolio: Story = { render: () => <PortfolioTable /> }
