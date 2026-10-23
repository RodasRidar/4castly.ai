import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { SearchField } from './SearchField'

function Stateful(args: ComponentProps<typeof SearchField>) {
  const [value, setValue] = useState(args.value)
  return <SearchField {...args} value={value} onValueChange={setValue} />
}

const meta = {
  title: 'Molecules/SearchField',
  component: SearchField,
  args: { 'aria-label': 'Buscar producto', placeholder: 'Buscar por nombre o código', clearLabel: 'Borrar búsqueda', value: '', onValueChange: () => {} },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof SearchField>
export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}
export const WithText: Story = { args: { value: 'Ácido cítrico' } }
