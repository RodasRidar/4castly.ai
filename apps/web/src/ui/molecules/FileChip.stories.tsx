import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileChip } from './FileChip'

const meta = {
  title: 'Molecules/FileChip',
  component: FileChip,
  args: { name: 'Kardex_movimientos_importaciones_2025.xlsx', size: '1,2 MB' },
} satisfies Meta<typeof FileChip>
export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = { args: { removeLabel: 'Quitar archivo', onRemove: () => {}, changeLabel: 'Cambiar archivo', onChange: () => {} } }
export const ShortName: Story = { args: { name: 'kardex.xlsx', size: '340 KB' } }
export const Uploading: Story = { args: { state: 'uploading', uploadingText: 'Subiendo archivo…' } }
export const ErrorState: Story = { args: { state: 'error', errorText: 'No se pudo leer el archivo', removeLabel: 'Quitar archivo', onRemove: () => {} } }
