import type { Meta, StoryObj } from '@storybook/react-vite'
import { MessageSquare, SearchX } from 'lucide-react'
import { Button } from '../atoms/Button'
import { EmptyState } from './EmptyState'

const meta = {
  title: 'Molecules/EmptyState',
  component: EmptyState,
  args: { icon: MessageSquare, title: 'Aún no hay conversaciones', body: 'Sube un reporte de Kardex para crear tu primer pronóstico.' },
} satisfies Meta<typeof EmptyState>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithAction: Story = { args: { action: <Button>Nuevo forecast</Button> } }
export const NoResults: Story = {
  args: { icon: SearchX, title: 'Sin resultados', body: 'Ningún producto coincide con los filtros.', action: <Button variant="secondary">Restablecer filtros</Button> },
}
