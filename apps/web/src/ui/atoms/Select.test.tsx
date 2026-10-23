import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

const options = [{ value: 'a', label: 'Fecha' }, { value: 'b', label: 'Producto' }]

describe('Select', () => {
  it('is a combobox with a name and lists options', () => {
    render(<Select aria-label="Columna" options={options} />)
    expect(screen.getByRole('combobox', { name: 'Columna' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })
  it('reports the selected value', async () => {
    const onValueChange = vi.fn()
    render(<Select aria-label="c" options={options} onValueChange={onValueChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'b')
    expect(onValueChange).toHaveBeenCalledWith('b')
  })
  it('adds an empty option such as "No tengo esta columna"', () => {
    render(<Select aria-label="c" options={options} emptyOption="— No tengo esta columna —" />)
    expect(screen.getByRole('option', { name: '— No tengo esta columna —' })).toHaveValue('')
  })
  it('flags error and disabled states', () => {
    const { rerender } = render(<Select aria-label="c" options={options} invalid />)
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    rerender(<Select aria-label="c" options={options} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
