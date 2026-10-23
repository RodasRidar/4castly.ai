import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontal } from 'lucide-react'
import { IconButton } from '../atoms/IconButton'
import { ConversationItem } from './ConversationItem'

const meta = {
  title: 'Molecules/ConversationItem',
  component: ConversationItem,
  args: { title: 'Pronóstico de ácido cítrico', href: '#' },
  decorators: [(Story) => <div className="w-64"><Story /></div>],
} satisfies Meta<typeof ConversationItem>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Active: Story = { args: { active: true } }
export const Pinned: Story = { args: { pinned: true, pinnedLabel: 'Fijada' } }
export const Processing: Story = { args: { status: 'processing', statusLabel: 'Calculando' } }
export const Failed: Story = { args: { status: 'failed', statusLabel: 'Falló' } }
export const WithMenu: Story = {
  args: { menu: <IconButton label="Opciones de la conversación" icon={MoreHorizontal} size="sm" /> },
}
export const Renaming: Story = {
  args: { renaming: true, renameLabel: 'Renombrar conversación', onRename: () => {}, onRenameCancel: () => {} },
}
