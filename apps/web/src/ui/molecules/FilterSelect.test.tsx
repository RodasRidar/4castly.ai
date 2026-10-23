import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterSelect } from './FilterSelect'

const options = [
  { value: '', label: 'Todos' },
  { value: 'critical', label: 'Crítico' },
  { value: 'medium', label: 'Medio' },
]

describe('FilterSelect', () => {
  it('labels the select with the visible label', () => {
    render(<FilterSelect label="Riesgo" options={options} value="" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Riesgo' })).toHaveValue('')
    expect(screen.getByText('Riesgo')).toBeVisible()
  })
  it('reports the chosen value', async () => {
    const onValueChange = vi.fn()
    render(<FilterSelect label="Riesgo" options={options} value="" onValueChange={onValueChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Riesgo' }), 'critical')
    expect(onValueChange).toHaveBeenCalledWith('critical')
  })
  it('reflects the controlled value', () => {
    render(<FilterSelect label="Riesgo" options={options} value="medium" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Riesgo' })).toHaveValue('medium')
  })
})
