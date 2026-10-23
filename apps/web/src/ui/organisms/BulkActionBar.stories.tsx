import type { Meta, StoryObj } from '@storybook/react-vite'
import { BulkActionBar } from './BulkActionBar'

const meta = {
  title: 'Organisms/BulkActionBar',
  component: BulkActionBar,
  args: {
    count: 3,
    label: 'Acciones de selección',
    countText: '3 seleccionados',
    clearLabel: 'Limpiar',
    exportLabel: 'Exportar selección',
    onClear: () => {},
    onExport: () => {},
  },
} satisfies Meta<typeof BulkActionBar>
export default meta
type Story = StoryObj<typeof meta>

export const Selected: Story = {}
export const Single: Story = { args: { count: 1, countText: '1 seleccionado' } }
export const Hidden: Story = { args: { count: 0 } }
