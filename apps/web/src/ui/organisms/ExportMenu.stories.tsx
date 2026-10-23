import type { Meta, StoryObj } from '@storybook/react-vite'
import { ExportMenu } from './ExportMenu'

const meta = {
  title: 'Organisms/ExportMenu',
  component: ExportMenu,
  args: {
    triggerLabel: 'Exportar',
    allLabel: 'Excel: todos los productos',
    selectionLabel: 'Excel: productos seleccionados',
    productLabel: 'Excel: este producto',
  },
} satisfies Meta<typeof ExportMenu>
export default meta
type Story = StoryObj<typeof meta>

export const Results: Story = { args: { onExportAll: () => {}, onExportSelection: () => {}, selectionDisabled: true } }
export const WithSelection: Story = { args: { onExportAll: () => {}, onExportSelection: () => {} } }
export const ProductDetail: Story = { args: { onExportProduct: () => {} } }
export const Disabled: Story = { args: { onExportAll: () => {}, disabled: true } }
