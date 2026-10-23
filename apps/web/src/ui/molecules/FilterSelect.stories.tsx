import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilterSelect } from './FilterSelect'

const meta = {
  title: 'Molecules/FilterSelect',
  component: FilterSelect,
  args: {
    label: 'Riesgo',
    value: '',
    onValueChange: () => {},
    options: [
      { value: '', label: 'Todos' },
      { value: 'critical', label: 'Crítico' },
      { value: 'medium', label: 'Medio' },
      { value: 'optimal', label: 'Óptimo' },
    ],
  },
} satisfies Meta<typeof FilterSelect>
export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
export const Selected: Story = { args: { value: 'critical' } }
export const Disabled: Story = { args: { disabled: true } }
