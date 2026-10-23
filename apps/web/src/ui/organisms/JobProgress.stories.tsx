import type { Meta, StoryObj } from '@storybook/react-vite'
import { JobProgress } from './JobProgress'

const meta = {
  title: 'Organisms/JobProgress',
  component: JobProgress,
  args: {
    label: 'Progreso del análisis',
    steps: [
      { id: 'read', label: 'Leyendo archivo' },
      { id: 'cols', label: 'Identificando columnas' },
      { id: 'clean', label: 'Limpiando datos' },
      { id: 'ready', label: 'Listo para pronosticar' },
    ],
    activeIndex: 1,
    statusLabels: { done: 'Completado', active: 'En curso', pending: 'Pendiente' },
  },
} satisfies Meta<typeof JobProgress>
export default meta
type Story = StoryObj<typeof meta>

export const Stepper: Story = {}
export const StepperWithCancel: Story = { args: { cancelLabel: 'Cancelar', onCancel: () => {} } }
export const AllDone: Story = { args: { activeIndex: 4 } }
export const SimpleLoader: Story = { args: { steps: undefined, text: 'Calculando pronósticos…' } }
export const SimpleLoaderWithCancel: Story = { args: { steps: undefined, text: 'Calculando pronósticos…', cancelLabel: 'Cancelar', onCancel: () => {} } }
