import type { Meta, StoryObj } from '@storybook/react-vite'
import { InlineNotice } from './InlineNotice'

const meta = { title: 'Molecules/InlineNotice', component: InlineNotice } satisfies Meta<typeof InlineNotice>
export default meta
type Story = StoryObj<typeof meta>

export const Info: Story = { args: { tone: 'info', children: 'Usamos los últimos 2 años y 9 meses de historia para el cálculo.' } }
export const Warning: Story = {
  args: { tone: 'warning', title: 'Falta stock actual', children: 'No encontramos stock para 3 productos; no calcularemos su cobertura.' },
}
export const Staleness: Story = { args: { tone: 'staleness', children: 'Datos hasta el 30 de septiembre. Sube un archivo nuevo para actualizar.' } }
