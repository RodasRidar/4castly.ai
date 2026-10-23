import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReliabilityBadge } from './ReliabilityBadge'

const meta = { title: 'Molecules/ReliabilityBadge', component: ReliabilityBadge } satisfies Meta<typeof ReliabilityBadge>
export default meta
type Story = StoryObj<typeof meta>

export const High: Story = { args: { level: 'high', label: 'Alta' } }
export const Medium: Story = { args: { level: 'medium', label: 'Media' } }
export const Low: Story = { args: { level: 'low', label: 'Baja' } }
