import type { Meta, StoryObj } from '@storybook/react-vite'
import { StageStep } from './StageStep'

const meta = {
  title: 'Molecules/StageStep',
  component: StageStep,
  args: { label: 'Identificando columnas', statusLabel: 'En curso' },
  decorators: [
    (Story) => (
      <ol>
        <Story />
      </ol>
    ),
  ],
} satisfies Meta<typeof StageStep>
export default meta
type Story = StoryObj<typeof meta>

export const Done: Story = { args: { status: 'done', label: 'Leyendo archivo', statusLabel: 'Completado' } }
export const Active: Story = { args: { status: 'active' } }
export const Pending: Story = { args: { status: 'pending', label: 'Limpiando datos', statusLabel: 'Pendiente' } }
