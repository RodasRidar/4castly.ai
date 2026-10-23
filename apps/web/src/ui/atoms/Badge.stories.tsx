import type { Meta, StoryObj } from '@storybook/react-vite'

import { Badge } from './Badge'

const meta = { title: 'Atoms/Badge', component: Badge } satisfies Meta<typeof Badge>
export default meta
type Story = StoryObj<typeof meta>

export const Neutral: Story = { args: { tone: 'neutral', children: 'Nuevo' } }
export const Soon: Story = { args: { tone: 'soon', children: 'Próximamente' } }
export const Count: Story = { args: { tone: 'count', children: '3' } }
