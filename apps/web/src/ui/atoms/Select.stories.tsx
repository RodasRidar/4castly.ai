import type { Meta, StoryObj } from '@storybook/react-vite'

import { Select } from './Select'

const options = [
  { value: 'date', label: 'Fecha' },
  { value: 'product', label: 'Producto' },
  { value: 'qty', label: 'Cantidad' },
]
const meta = { title: 'Atoms/Select', component: Select, args: { 'aria-label': 'Columna', options } } satisfies Meta<typeof Select>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NoColumnOption: Story = { args: { emptyOption: '— No tengo esta columna —' } }
export const Error: Story = { args: { invalid: true } }
export const Disabled: Story = { args: { disabled: true } }
