import type { Meta, StoryObj } from '@storybook/react-vite'

import { NumberValue } from './NumberValue'

const meta = { title: 'Atoms/NumberValue', component: NumberValue, args: { locale: 'es' } } satisfies Meta<typeof NumberValue>
export default meta
type Story = StoryObj<typeof meta>

export const Plain: Story = { args: { value: 12345.5 } }
export const WithUnit: Story = { args: { value: 280, unit: 'u' } }
export const Range: Story = { args: { range: [280, 310], unit: 'u' } }
export const Empty: Story = { args: { value: null } }
