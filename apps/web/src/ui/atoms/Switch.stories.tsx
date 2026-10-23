import type { Meta, StoryObj } from '@storybook/react-vite'

import { Switch } from './Switch'

const meta = { title: 'Atoms/Switch', component: Switch, args: { 'aria-label': 'Notificaciones', onCheckedChange: () => {} } } satisfies Meta<typeof Switch>
export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = { args: { checked: false } }
export const On: Story = { args: { checked: true } }
export const Disabled: Story = { args: { checked: true, disabled: true } }
