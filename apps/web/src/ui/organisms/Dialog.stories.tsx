import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { Dialog } from './Dialog'

const meta = {
  title: 'Organisms/Dialog',
  component: Dialog,
  args: { open: true, onOpenChange: () => {}, title: 'Eliminar conversación', description: 'Se eliminarán el archivo y los resultados. No se puede deshacer.', closeLabel: 'Cerrar' },
} satisfies Meta<typeof Dialog>
export default meta
type Story = StoryObj<typeof meta>

export const Confirm: Story = {
  args: { children: <div className="flex justify-end gap-2"><Button variant="secondary">Cancelar</Button><Button variant="danger-text">Eliminar</Button></div> },
}
export const WithoutDescription: Story = { args: { description: undefined, title: 'Renombrar conversación', children: <input aria-label="Nombre" className="h-9 rounded-md border border-hairline bg-elevated px-3 text-ink" /> } }
