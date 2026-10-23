import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ParametersDrawer, type ParametersDrawerProps, type ParametersValues } from './ParametersDrawer'

const copy = {
  title: 'Parámetros del pronóstico',
  closeLabel: 'Cerrar',
  horizon: { label: 'Horizonte', options: [{ value: '8', label: '8 semanas' }, { value: '12', label: '12 semanas' }, { value: '24', label: '24 semanas' }] },
  granularity: { label: 'Granularidad', options: [{ value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensual' }] },
  leadTime: { label: 'Tiempo de reposición', decrementLabel: 'Reducir reposición', incrementLabel: 'Aumentar reposición', unit: 'días', min: 1, max: 180 },
  threshold: { label: 'Umbral crítico', decrementLabel: 'Reducir umbral', incrementLabel: 'Aumentar umbral', unit: 'semanas', min: 1, max: 26 },
  style: { label: 'Estilo del asistente', options: [{ value: 'brief', label: 'Breve' }, { value: 'detailed', label: 'Detallado' }] },
  recalculateLabel: 'Recalcular',
}

function Interactive({ recalculating }: { recalculating?: boolean }) {
  const [values, setValues] = useState<ParametersValues>({ horizon: '12', granularity: 'weekly', leadTime: 14, threshold: 4, style: 'brief' })
  const onChange: ParametersDrawerProps['onChange'] = (field, value) => setValues((v) => ({ ...v, [field]: value }))
  return (
    <ParametersDrawer
      {...copy}
      open
      onOpenChange={() => {}}
      values={values}
      onChange={onChange}
      onRecalculate={() => {}}
      recalculating={recalculating}
    />
  )
}

const meta = { title: 'Organisms/ParametersDrawer', component: Interactive } satisfies Meta<typeof Interactive>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Recalculating: Story = { args: { recalculating: true } }
