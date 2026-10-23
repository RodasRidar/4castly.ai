import type { Meta, StoryObj } from '@storybook/react-vite'
import { AssistantDrawer } from './AssistantDrawer'

const meta = {
  title: 'Organisms/AssistantDrawer',
  component: AssistantDrawer,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onOpenChange: () => {},
    title: 'Preguntar sobre este producto',
    closeLabel: 'Cerrar',
    contextLine: 'Ácido cítrico 25 kg · PRQ-010130',
    thread: {
      label: 'Conversación',
      jumpLabel: 'Ir al último mensaje',
      loadingLabel: 'Cargando mensajes',
      emptyTitle: 'Aún no hay mensajes',
      emptyBody: 'Haz una pregunta sobre este producto.',
      errorTitle: 'No pudimos cargar la conversación',
      errorBody: 'Intenta de nuevo.',
      retryLabel: 'Reintentar',
      messages: [
        { id: '1', role: 'user', authorLabel: 'Tú', text: '¿Cuándo se agota?' },
        { id: '2', role: 'assistant', authorLabel: 'Asistente', text: 'Con la demanda típica, en unas **3 semanas**.' },
      ],
    },
    composer: {
      label: 'Mensaje',
      placeholder: 'Pregunta sobre este producto',
      sendLabel: 'Enviar',
      stopLabel: 'Detener',
      hint: { send: 'para enviar', newline: 'para nueva línea' },
      value: '',
      onChange: () => {},
      onSend: () => {},
    },
    suggestions: { label: 'Preguntas sugeridas', suggestions: ['¿Cuánto debo comprar?', '¿Qué tan confiable es el pronóstico?'], onSelect: () => {} },
  },
} satisfies Meta<typeof AssistantDrawer>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Empty: Story = { args: { thread: { ...meta.args.thread, messages: [] } } }
export const Locked: Story = {
  args: { composer: { ...meta.args.composer, locked: true, lockedReason: 'El pronóstico aún se está calculando.' }, suggestions: { ...meta.args.suggestions, locked: true } },
}
