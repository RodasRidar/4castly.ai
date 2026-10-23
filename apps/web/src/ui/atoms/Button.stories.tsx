import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, Plus } from 'lucide-react'
import { Icon } from './Icon'
import { Button } from './Button'

const meta = { title: 'Atoms/Button', component: Button, args: { children: 'Continuar' } } satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Ghost: Story = { args: { variant: 'ghost' } }
export const DangerText: Story = { args: { variant: 'danger-text', children: 'Eliminar' } }
export const Small: Story = { args: { size: 'sm' } }
export const Loading: Story = { args: { loading: true } }
export const Disabled: Story = { args: { disabled: true } }
export const WithIcons: Story = {
  args: { variant: 'secondary', iconLeft: <Icon icon={Plus} />, iconRight: <Icon icon={ArrowRight} /> },
}
