import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button } from '../atoms/Button'
import { WeeklyProjectionTable, type WeeklyProjectionRow, type WeeklyProjectionTableProps } from './WeeklyProjectionTable'

const noPurchase: WeeklyProjectionRow[] = [
  { weekStart: new Date('2026-10-26T00:00:00Z'), low: 100, expected: 120, high: 150, projectedStock: 300, shortfall: 0, status: { level: 'optimal', label: 'Cubierto' } },
  { weekStart: new Date('2026-11-02T00:00:00Z'), low: 100, expected: 130, high: 170, projectedStock: 170, shortfall: 0, status: { level: 'optimal', label: 'Cubierto' } },
  { weekStart: new Date('2026-11-09T00:00:00Z'), low: 110, expected: 140, high: 190, projectedStock: 30, shortfall: 0, status: { level: 'medium', label: 'Ajustado' } },
  { weekStart: new Date('2026-11-16T00:00:00Z'), low: 110, expected: 140, high: 190, projectedStock: 0, shortfall: 110, status: { level: 'critical', label: 'Faltante' } },
]
const withPurchase: WeeklyProjectionRow[] = noPurchase.map((r, i) => (i < 2 ? r : { ...r, projectedStock: r.projectedStock + 400, shortfall: 0, status: { level: 'optimal' as const, label: 'Cubierto' } }))

const scenarioOptions = [
  { value: 'none', label: 'Sin nueva compra' },
  { value: 'suggested', label: 'Con compra sugerida' },
]

const args: WeeklyProjectionTableProps = {
  state: 'populated',
  caption: 'Proyección semanal de Ácido cítrico 25 kg',
  columns: { week: 'Semana', low: 'Escenario bajo', expected: 'Escenario esperado', high: 'Escenario alto', stock: 'Stock proyectado', shortfall: 'Faltante', status: 'Estado' },
  unit: 'u',
  rows: noPurchase,
  scenario: { label: 'Escenario de compra', value: 'none', onValueChange: () => {}, options: scenarioOptions },
  loadingLabel: 'Cargando proyección semanal',
  empty: { title: 'Todavía no hay proyección', body: 'Cuando termine el cálculo verás aquí cada semana.' },
  error: { title: 'No pudimos cargar la proyección', body: 'Intenta de nuevo en unos minutos.', action: <Button variant="secondary">Reintentar</Button> },
}

const meta = { title: 'Organisms/WeeklyProjectionTable', component: WeeklyProjectionTable, args } satisfies Meta<typeof WeeklyProjectionTable>
export default meta
type Story = StoryObj<typeof meta>

export const WithoutNewPurchase: Story = {}
export const WithSuggestedPurchase: Story = { args: { rows: withPurchase, scenario: { ...args.scenario, value: 'suggested' } } }
export const Mobile390: Story = { render: (a) => <div className="w-[390px]"><WeeklyProjectionTable {...a} /></div> }
export const Loading: Story = { args: { state: 'loading' } }
export const Empty: Story = { args: { state: 'empty' } }
export const ErrorState: Story = { args: { state: 'error' } }

function ScenarioTable() {
  const [value, setValue] = useState('none')
  return <WeeklyProjectionTable {...args} rows={value === 'none' ? noPurchase : withPurchase} scenario={{ ...args.scenario, value, onValueChange: setValue }} />
}
export const Interactive: Story = { render: () => <ScenarioTable /> }
