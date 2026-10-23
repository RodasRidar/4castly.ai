import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberValue } from '../atoms/NumberValue'
import { KpiRow, type KpiRowItem } from './KpiRow'

const items: KpiRowItem[] = [
  { id: 'risk', label: 'Productos en riesgo', value: <NumberValue value={12} />, caption: 'de 142 productos' },
  { id: 'coverage', label: 'Cobertura promedio', value: <NumberValue value={9.5} unit="semanas" /> },
  { id: 'reliability', label: 'Confiabilidad', value: 'Alta' },
]

describe('KpiRow', () => {
  it('populated shows three cards with values', () => {
    render(<KpiRow state="populated" items={items} loadingLabel="Cargando" label="Indicadores" />)
    expect(screen.getAllByRole('group', { name: /Productos en riesgo|Cobertura promedio|Confiabilidad/ })).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Productos en riesgo' })).toHaveTextContent('12')
    expect(screen.getByText('de 142 productos')).toBeInTheDocument()
  })
  it('loading marks cards busy and hides values', () => {
    render(<KpiRow state="loading" items={items} loadingLabel="Cargando indicadores" label="Indicadores" />)
    for (const g of screen.getAllByRole('group', { name: /Productos|Cobertura|Confiabilidad/ })) expect(g).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Alta')).toBeNull()
  })
  it('empty shows dashes', () => {
    render(<KpiRow state="empty" items={items} loadingLabel="Cargando" label="Indicadores" />)
    expect(screen.getAllByText('—')).toHaveLength(3)
  })
  it('error renders the error state instead of cards', () => {
    render(<KpiRow state="error" items={items} loadingLabel="Cargando" label="Indicadores" error={{ title: 'No pudimos cargar los indicadores', body: 'Intenta de nuevo.' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los indicadores')
    expect(screen.queryByRole('group', { name: 'Productos en riesgo' })).toBeNull()
  })
})
