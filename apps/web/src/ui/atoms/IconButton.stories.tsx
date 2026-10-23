import type { Meta, StoryObj } from '@storybook/react-vite'
import { PanelLeftClose } from 'lucide-react'
import { IconButton } from './IconButton'

const meta = { title: 'Atoms/IconButton', component: IconButton, args: { label: 'Contraer barra lateral', icon: PanelLeftClose } } satisfies Meta<typeof IconButton>
export default meta
type Story = StoryObj<typeof meta>

export const Ghost: Story = {}
export const Outline: Story = { args: { variant: 'outline' } }
export const Small: Story = { args: { size: 'sm' } }
export const Disabled: Story = { args: { disabled: true } }
