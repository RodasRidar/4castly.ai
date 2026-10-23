import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConfirmedDataLine } from './ConfirmedDataLine'

const detail = <p>142 productos y 2 años y 9 meses de historia. Columnas: Fecha, Código, Salida.</p>

const meta = {
  title: 'Organisms/ConfirmedDataLine',
  component: ConfirmedDataLine,
  args: { summaryLabel: 'Datos confirmados', toggleLabel: 'Ver detalle', hideLabel: 'Ocultar detalle', children: detail },
} satisfies Meta<typeof ConfirmedDataLine>
export default meta
type Story = StoryObj<typeof meta>

export const Collapsed: Story = {}
export const Expanded: Story = { args: { defaultExpanded: true } }
export const NoDetail: Story = { args: { children: undefined } }
