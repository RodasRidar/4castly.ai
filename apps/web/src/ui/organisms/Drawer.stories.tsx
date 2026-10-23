import type { Meta, StoryObj } from '@storybook/react-vite'
import { Drawer } from './Drawer'

const meta = {
  title: 'Organisms/Drawer',
  component: Drawer,
  args: { open: true, onOpenChange: () => {}, title: 'Preguntar', closeLabel: 'Cerrar', children: <p className="text-body-md text-body">Contenido del panel.</p> },
} satisfies Meta<typeof Drawer>
export default meta
type Story = StoryObj<typeof meta>

export const Right: Story = {}
export const Left: Story = { args: { side: 'left' } }
