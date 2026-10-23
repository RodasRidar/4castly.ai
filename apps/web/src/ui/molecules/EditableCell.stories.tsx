import type { Meta, StoryObj } from '@storybook/react-vite'
import { EditableCell } from './EditableCell'

const meta = {
  title: 'Molecules/EditableCell',
  component: EditableCell,
  args: { value: 45, unit: 'd', min: 1, max: 365, editLabel: 'Editar plazo de entrega', inputLabel: 'Plazo de entrega en días', onCommit: () => {} },
} satisfies Meta<typeof EditableCell>
export default meta
type Story = StoryObj<typeof meta>

export const Display: Story = {}
export const Saving: Story = { args: { status: 'saving', savingText: 'Guardando…' } }
export const ErrorState: Story = { args: { status: 'error', errorText: 'No se pudo guardar' } }
