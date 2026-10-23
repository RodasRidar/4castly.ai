import type { Meta, StoryObj } from '@storybook/react-vite'
import { Toast, ToastProvider } from './Toast'

const meta = {
  title: 'Molecules/Toast',
  component: Toast,
  args: {
    open: true,
    onOpenChange: () => {},
    variant: 'info',
    title: 'Conversación archivada',
    description: 'Puedes encontrarla en el historial.',
    dismissLabel: 'Cerrar notificación',
    duration: 1_000_000,
  },
  decorators: [
    (Story) => (
      <ToastProvider label="Notificaciones" duration={1_000_000}>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Toast>
export default meta
type Story = StoryObj<typeof meta>

export const Info: Story = {}
export const Success: Story = { args: { variant: 'success', title: 'Cambios guardados', description: 'Lead time de Ácido cítrico actualizado.' } }
export const ErrorVariant: Story = { args: { variant: 'error', title: 'No se pudo eliminar', description: 'Inténtalo de nuevo en unos segundos.' } }
export const WithUndoAction: Story = {
  args: { title: 'Conversación eliminada', description: undefined, actionLabel: 'Deshacer', onAction: () => {} },
}
