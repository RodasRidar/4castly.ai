import type { Meta, StoryObj } from '@storybook/react-vite'
import { RiskBadge } from './RiskBadge'

const meta = { title: 'Molecules/RiskBadge', component: RiskBadge } satisfies Meta<typeof RiskBadge>
export default meta
type Story = StoryObj<typeof meta>

export const Critical: Story = { args: { level: 'critical', label: 'Crítico' } }
export const Medium: Story = { args: { level: 'medium', label: 'Medio' } }
export const Optimal: Story = { args: { level: 'optimal', label: 'Óptimo' } }
