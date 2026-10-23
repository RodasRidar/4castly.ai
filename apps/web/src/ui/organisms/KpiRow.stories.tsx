import type { Meta, StoryObj } from '@storybook/react-vite'
import { NumberValue } from '../atoms/NumberValue'
import { Button } from '../atoms/Button'
import { ReliabilityBadge } from '../molecules/ReliabilityBadge'
import { KpiRow } from './KpiRow'

const items = [
  { id: 'risk', label: 'Productos en riesgo', value: <NumberValue value={12} />, caption: 'de 142 productos', linkLabel: 'Ver productos', href: '#riesgo' },
  { id: 'coverage', label: 'Cobertura promedio', value: <NumberValue value={9.5} unit="semanas" />, caption: 'con la demanda esperada' },
  { id: 'reliability', label: 'Confiabilidad', value: <ReliabilityBadge level="high" label="Alta" />, caption: 'según el historial disponible' },
]

const meta = {
  title: 'Organisms/KpiRow',
  component: KpiRow,
  args: { state: 'populated', items, label: 'Indicadores clave', loadingLabel: 'Cargando indicadores' },
} satisfies Meta<typeof KpiRow>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const ErrorState: Story = {
  args: { state: 'error', error: { title: 'No pudimos cargar los indicadores', body: 'Intenta de nuevo en unos minutos.', action: <Button variant="secondary">Reintentar</Button> } },
}
