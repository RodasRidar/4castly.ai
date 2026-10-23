import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConversationMenu } from './ConversationMenu'

const meta = {
  title: 'Organisms/ConversationMenu',
  component: ConversationMenu,
  args: {
    triggerLabel: 'Opciones de la conversación',
    pinLabel: 'Fijar',
    unpinLabel: 'Desfijar',
    renameLabel: 'Renombrar',
    archiveLabel: 'Archivar',
    deleteLabel: 'Eliminar',
    confirmTitle: 'Eliminar conversación',
    confirmDescription: 'Se eliminará "Ácido cítrico 25 kg" y sus resultados. Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    closeLabel: 'Cerrar',
    onPin: () => {},
    onRename: () => {},
    onArchive: () => {},
    onDelete: () => {},
  },
  decorators: [(Story) => <div className="flex h-64 justify-end"><Story /></div>],
} satisfies Meta<typeof ConversationMenu>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Pinned: Story = { args: { pinned: true } }
