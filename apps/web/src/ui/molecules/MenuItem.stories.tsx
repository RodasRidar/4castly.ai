import type { Meta, StoryObj } from '@storybook/react-vite'
import { Archive, Pin, Trash2 } from 'lucide-react'
import { MenuItem } from './MenuItem'

const meta = {
  title: 'Molecules/MenuItem',
  component: MenuItem,
  args: { label: 'Fijar conversación', icon: Pin },
  decorators: [(Story) => <div role="menu" aria-label="Acciones" className="w-56 rounded-md border border-hairline bg-elevated p-1 shadow-popover"><Story /></div>],
} satisfies Meta<typeof MenuItem>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithoutIcon: Story = { args: { icon: undefined, label: 'Renombrar' } }
export const Danger: Story = { args: { label: 'Eliminar', icon: Trash2, danger: true } }
export const Disabled: Story = { args: { label: 'Archivar', icon: Archive, disabled: true } }
