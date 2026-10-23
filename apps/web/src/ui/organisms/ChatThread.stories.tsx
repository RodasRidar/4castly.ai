import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChatThread, type ChatThreadMessage } from './ChatThread'

const messages: ChatThreadMessage[] = [
  { id: '1', role: 'user', authorLabel: 'Tú', text: 'Hola, ¿cómo va el stock de glicerina?', dividerLabel: 'Ayer' },
  { id: '2', role: 'assistant', authorLabel: 'Asistente', text: 'La glicerina USP tiene **cobertura de 5 semanas**.' },
  { id: '3', role: 'user', authorLabel: 'Tú', text: '¿Y el ácido cítrico 25 kg?', dividerLabel: 'Hoy' },
  { id: '4', role: 'assistant', authorLabel: 'Asistente', text: 'Se agotaría en unas 3 semanas. Te sugiero comprar antes.' },
]

const meta = {
  title: 'Organisms/ChatThread',
  component: ChatThread,
  args: {
    label: 'Conversación',
    jumpLabel: 'Ir al último mensaje',
    messages,
    loadingLabel: 'Cargando mensajes',
    emptyTitle: 'Aún no hay mensajes',
    emptyBody: 'Haz una pregunta sobre tu pronóstico.',
    errorTitle: 'No pudimos cargar la conversación',
    errorBody: 'Intenta de nuevo.',
    retryLabel: 'Reintentar',
    onRetry: () => {},
  },
  decorators: [(Story) => <div className="flex h-96 max-w-xl flex-col border border-hairline"><Story /></div>],
} satisfies Meta<typeof ChatThread>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const Streaming: Story = {
  args: { messages: [...messages, { id: '5', role: 'assistant', authorLabel: 'Asistente', text: 'Revisando', streaming: true, toolLines: ['Consultando el stock de Glicerina…'] }] },
}
export const Loading: Story = { args: { state: 'loading', messages: [] } }
export const Empty: Story = { args: { messages: [] } }
export const Error: Story = { args: { state: 'error', messages: [] } }
