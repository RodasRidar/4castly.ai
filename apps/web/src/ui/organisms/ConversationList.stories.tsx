import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConversationList } from './ConversationList'

const labels = {
  label: 'Conversaciones',
  loadingLabel: 'Cargando conversaciones',
  emptyTitle: 'Aún no hay conversaciones',
  emptyBody: 'Sube un Kardex para crear tu primer forecast.',
  errorTitle: 'No pudimos cargar tus conversaciones',
  errorBody: 'Revisa tu conexión e intenta de nuevo.',
  retryLabel: 'Reintentar',
  pinnedLabel: 'Fijada',
  processingLabel: 'Calculando',
  failedLabel: 'Falló',
  renameLabel: 'Renombrar conversación',
}

const meta = {
  title: 'Organisms/ConversationList',
  component: ConversationList,
  args: {
    ...labels,
    groups: [
      { id: 'pinned', title: 'Fijados', items: [{ id: '1', title: 'Ácido cítrico 25 kg', href: '#1', pinned: true }] },
      { id: 'today', title: 'Hoy', items: [{ id: '2', title: 'Glicerina USP', href: '#2', active: true }, { id: '3', title: 'Sorbitol 70 %', href: '#3', status: 'processing' }] },
      { id: 'week', title: 'Esta semana', items: [] },
      { id: 'older', title: 'Antes', items: [{ id: '4', title: 'Benzoato de sodio', href: '#4', status: 'failed' }] },
    ],
  },
  decorators: [(Story) => <div className="w-64"><Story /></div>],
} satisfies Meta<typeof ConversationList>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const Loading: Story = { args: { state: 'loading', groups: [] } }
export const Empty: Story = { args: { groups: [] } }
export const Error: Story = { args: { state: 'error', groups: [], onRetry: () => {} } }
export const Renaming: Story = { args: { renamingId: '2', onRename: () => {}, onRenameCancel: () => {} } }
