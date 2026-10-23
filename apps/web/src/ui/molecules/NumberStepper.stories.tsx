import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { NumberStepper } from './NumberStepper'

function Stateful(args: ComponentProps<typeof NumberStepper>) {
  const [value, setValue] = useState(args.value)
  return <NumberStepper {...args} value={value} onChange={setValue} />
}

const meta = {
  title: 'Molecules/NumberStepper',
  component: NumberStepper,
  args: { label: 'Cobertura objetivo', decrementLabel: 'Disminuir', incrementLabel: 'Aumentar', unit: 'sem', value: 6, min: 1, max: 12, onChange: () => {} },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof NumberStepper>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const AtMinimum: Story = { args: { value: 1 } }
export const AtMaximum: Story = { args: { value: 12 } }
export const Disabled: Story = { args: { disabled: true } }
