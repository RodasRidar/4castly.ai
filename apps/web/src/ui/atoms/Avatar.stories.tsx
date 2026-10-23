import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = { title: 'Atoms/Avatar', component: Avatar, args: { name: 'Ana Pérez' } } satisfies Meta<typeof Avatar>
export default meta
type Story = StoryObj<typeof meta>

export const Small: Story = { args: { size: 'sm' } }
export const Medium: Story = { args: { size: 'md' } }
export const Large: Story = { args: { size: 'lg' } }
export const SingleName: Story = { args: { name: 'Rodas' } }
