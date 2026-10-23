import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { Popover } from './Popover'

const meta = {
  title: 'Organisms/Popover',
  component: Popover,
  args: { trigger: <Button variant="secondary">Abrir</Button>, label: 'Detalle', children: <p className="px-2 py-1 text-body-md text-body">Contenido del popover.</p> },
} satisfies Meta<typeof Popover>
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}
export const AlignedEnd: Story = { args: { align: 'end', side: 'bottom' } }
