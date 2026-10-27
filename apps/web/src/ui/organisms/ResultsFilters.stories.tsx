import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ResultsFilters, type ResultsFiltersProps } from './ResultsFilters'

const riskOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'critical', label: 'Crítico' },
  { value: 'medium', label: 'Medio' },
  { value: 'optimal', label: 'Óptimo' },
]
const abcOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
]

const base: ResultsFiltersProps = {
  groupLabel: 'Filtros de productos',
  search: { value: '', onValueChange: () => {}, label: 'Buscar producto', placeholder: 'Buscar por nombre o código', clearLabel: 'Borrar búsqueda' },
  risk: { label: 'Riesgo', value: 'all', options: riskOptions, onValueChange: () => {} },
  abc: { label: 'Clase ABC', value: 'all', options: abcOptions, onValueChange: () => {} },
}

const meta = { title: 'Organisms/ResultsFilters', component: ResultsFilters, args: base } satisfies Meta<typeof ResultsFilters>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithFocus: Story = { args: { focus: { countText: '12 de 142 en foco', resetLabel: 'Restablecer', onReset: () => {} } } }

function InteractiveFilters() {
  const [q, setQ] = useState('ácido')
  const [risk, setRisk] = useState('critical')
  const [abc, setAbc] = useState('all')
  return (
    <ResultsFilters
      {...base}
      search={{ ...base.search, value: q, onValueChange: setQ }}
      risk={{ ...base.risk!, value: risk, onValueChange: setRisk }}
      abc={{ ...base.abc, value: abc, onValueChange: setAbc }}
      focus={{ countText: '12 de 142 en foco', resetLabel: 'Restablecer', onReset: () => setQ('') }}
    />
  )
}
export const Interactive: Story = { render: () => <InteractiveFilters /> }
