import type { Meta, StoryObj } from '@storybook/react-vite'
import { NumberValue } from '../atoms/NumberValue'
import { StatLine } from './StatLine'

const meta = { title: 'Molecules/StatLine', component: StatLine } satisfies Meta<typeof StatLine>
export default meta
type Story = StoryObj<typeof meta>

export const Text: Story = { args: { label: 'Proveedor', value: 'Química Andina S.A.' } }
export const Number: Story = { args: { label: 'Stock actual', value: <NumberValue value={1240} unit="kg" /> } }
