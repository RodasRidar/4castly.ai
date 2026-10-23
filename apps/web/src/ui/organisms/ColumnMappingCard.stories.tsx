import type { Meta, StoryObj } from '@storybook/react-vite'
import { ColumnMappingCard } from './ColumnMappingCard'

const rows = [
  { field: 'date', label: 'Fecha', column: 'Fecha', samples: ['02/01/2024', '03/01/2024', '04/01/2024'] },
  { field: 'sku', label: 'Producto', column: 'Código', samples: ['GLI-001', 'SOR-210', 'PAR-050'] },
  { field: 'out', label: 'Salidas', column: 'Salida', samples: ['120', '85', '40'] },
  { field: 'stock', label: 'Stock', optional: true, column: null, samples: [] },
]

const meta = {
  title: 'Organisms/ColumnMappingCard',
  component: ColumnMappingCard,
  args: {
    mode: 'read',
    title: 'Así entendí tu archivo',
    rows,
    columns: ['Fecha', 'Código', 'Descripción', 'Entrada', 'Salida', 'Existencia'],
    confirmLabel: 'Sí, es correcto',
    editLabel: 'Corregir',
    saveLabel: 'Guardar',
    cancelLabel: 'Cancelar',
    emptyOptionLabel: '— No tengo esta columna —',
    onConfirm: () => {},
    onEdit: () => {},
    onSave: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof ColumnMappingCard>
export default meta
type Story = StoryObj<typeof meta>

export const ReadOnly: Story = {}
export const WithWarnings: Story = { args: { warnings: ['3 productos tienen poco historial y su pronóstico será menos confiable.'] } }
export const WithSheets: Story = {
  args: {
    sheet: { label: 'Hoja', value: 'Kardex', options: [{ value: 'Kardex', label: 'Kardex' }, { value: 'Resumen', label: 'Resumen' }], onChange: () => {} },
  },
}
export const Edit: Story = { args: { mode: 'edit' } }
export const Loading: Story = { args: { loading: true } }
export const Empty: Story = { args: { rows: [], emptyText: 'No encontré columnas reconocibles.' } }
export const ErrorState: Story = { args: { error: 'No pude leer las columnas del archivo.' } }
