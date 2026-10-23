import type { Meta, StoryObj } from '@storybook/react-vite'
import { NumberValue } from '../atoms/NumberValue'
import { KpiCard } from './KpiCard'

const meta = {
  title: 'Molecules/KpiCard',
  component: KpiCard,
  args: { label: 'Compra sugerida: Ácido cítrico 25 kg', caption: 'próximos 90 días', linkLabel: 'Ver detalle', href: '#detalle' },
} satisfies Meta<typeof KpiCard>
export default meta
type Story = StoryObj<typeof meta>

export const Range: Story = { args: { value: <NumberValue range={[280, 310]} unit="u" /> } }
export const Single: Story = { args: { value: <NumberValue value={142} unit="productos" /> } }
export const Loading: Story = { args: { state: 'loading', loadingLabel: 'Cargando indicador' } }
export const Empty: Story = { args: { state: 'empty', linkLabel: undefined, href: undefined } }
