import type { Meta, StoryObj } from '@storybook/react-vite'
import { Logo } from './Logo'

const meta = { title: 'Atoms/Logo', component: Logo } satisfies Meta<typeof Logo>
export default meta
type Story = StoryObj<typeof meta>

export const Mark: Story = { args: { variant: 'mark' } }
export const Full: Story = { args: { variant: 'full' } }
