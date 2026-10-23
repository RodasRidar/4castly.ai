import type { Meta, StoryObj } from '@storybook/react-vite'
import { StreamingText } from './StreamingText'

const meta = {
  title: 'Molecules/StreamingText',
  component: StreamingText,
  args: { children: 'Encontré **3 productos** con riesgo de quiebre en las próximas 8 semanas.' },
} satisfies Meta<typeof StreamingText>
export default meta
type Story = StoryObj<typeof meta>

export const Streaming: Story = { args: { streaming: true, children: 'Encontré **3 productos** con riesgo de quiebre en las próximas' } }
export const Done: Story = {}
export const WithList: Story = {
  args: { children: 'Productos a revisar primero:\n\n- Ácido cítrico anhidro\n- Glicerina USP\n- Propilenglicol grado farmacéutico' },
}
export const WithTable: Story = {
  args: {
    children:
      '| Producto | Cobertura | Riesgo |\n|---|---|---|\n| Ácido cítrico anhidro | 9 días | Crítico |\n| Glicerina USP | 21 días | Medio |\n| Propilenglicol | 48 días | Óptimo |',
  },
}
