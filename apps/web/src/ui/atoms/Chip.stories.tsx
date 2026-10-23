import type { Meta, StoryObj } from '@storybook/react-vite'

import { Chip } from './Chip'

const meta = { title: 'Atoms/Chip', component: Chip, args: { children: '¿Qué productos están en riesgo?' } } satisfies Meta<typeof Chip>
export default meta
type Story = StoryObj<typeof meta>

export const Outline: Story = {}
export const Selectable: Story = { args: { selectable: true, selected: false, children: '14 días' } }
export const Selected: Story = { args: { selectable: true, selected: true, children: '14 días' } }
export const Removable: Story = { args: { onRemove: () => {}, removeLabel: 'Quitar filtro', children: 'Riesgo: Crítico' } }
export const Disabled: Story = { args: { disabled: true } }
