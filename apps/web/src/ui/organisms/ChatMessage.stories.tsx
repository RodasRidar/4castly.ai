import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChatMessage } from './ChatMessage'

const actions = {
  label: 'Acciones del mensaje',
  copyLabel: 'Copiar',
  retryLabel: 'Reintentar',
  likeLabel: 'Me gusta',
  dislikeLabel: 'No me gusta',
  onCopy: () => {},
  onRetry: () => {},
  onLike: () => {},
  onDislike: () => {},
}

const meta = {
  title: 'Organisms/ChatMessage',
  component: ChatMessage,
  args: { role: 'assistant', authorLabel: 'Asistente' },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof ChatMessage>
export default meta
type Story = StoryObj<typeof meta>

export const UserText: Story = { args: { role: 'user', authorLabel: 'Tú', text: '¿Cuándo se agota el ácido cítrico 25 kg?' } }
export const UserFile: Story = { args: { role: 'user', authorLabel: 'Tú', file: { name: 'kardex-importadora-acme-2026.xlsx', size: '1,2 MB' } } }
export const Assistant: Story = {
  args: {
    text: 'El **ácido cítrico 25 kg** (PRQ-010130) se agotaría en unas 3 semanas.\n\n- Demanda típica: 280–310 u por semana\n- Stock actual: 640 u',
    actions,
  },
}
export const Streaming: Story = { args: { text: 'Estoy revisando la demanda de las últimas', streaming: true } }
export const WithToolLine: Story = { args: { toolLines: ['Consultando el stock de Glicerina…'], streaming: true } }
export const WithCard: Story = {
  args: {
    text: 'Este es el resumen del producto:',
    card: <div className="rounded-lg border border-hairline bg-elevated p-4 text-body-md text-ink">Ácido cítrico 25 kg · PRQ-010130</div>,
    actions,
  },
}
export const Partial: Story = {
  args: {
    text: 'El ácido cítrico se agotaría en',
    note: { tone: 'warning', title: 'Respuesta incompleta', text: 'Se cortó la conexión. Puedes reintentar.' },
    actions,
  },
}
