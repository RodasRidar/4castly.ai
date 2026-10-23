import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
]
const meta = { title: 'Atoms/SegmentedControl', component: SegmentedControl, args: { 'aria-label': 'Tema', options, value: 'system', onValueChange: () => {} } } satisfies Meta<typeof SegmentedControl>
export default meta
type Story = StoryObj<typeof meta>

function Demo({ initial, opts }: { initial: string; opts: typeof options }) {
  const [value, setValue] = useState(initial)
  return <SegmentedControl aria-label="Tema" options={opts} value={value} onValueChange={setValue} />
}

export const ThreeOptions: Story = { render: () => <Demo initial="system" opts={options} /> }
export const TwoOptions: Story = { render: () => <Demo initial="light" opts={options.slice(0, 2)} /> }
