import type { Meta, StoryObj } from '@storybook/react-vite'

import { StatusDot } from './StatusDot'

const meta = { title: 'Atoms/StatusDot', component: StatusDot } satisfies Meta<typeof StatusDot>
export default meta
type Story = StoryObj<typeof meta>

export const Processing: Story = { args: { status: 'processing', label: 'Calculando' } }
export const Failed: Story = { args: { status: 'failed', label: 'Falló' } }
