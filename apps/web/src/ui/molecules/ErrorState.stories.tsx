import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../atoms/Button'
import { ErrorState } from './ErrorState'

const meta = {
  title: 'Molecules/ErrorState',
  component: ErrorState,
  args: { title: 'No pudimos calcular el pronóstico', body: 'Algo salió mal de nuestro lado. Tus datos están a salvo.' },
} satisfies Meta<typeof ErrorState>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithSupportReference: Story = { args: { supportReference: 'Referencia: 7F3A-92' } }
export const WithActions: Story = {
  args: {
    supportReference: 'Referencia: 7F3A-92',
    primaryAction: <Button>Reintentar</Button>,
    secondaryAction: <Button variant="secondary">Contactar soporte</Button>,
  },
}
