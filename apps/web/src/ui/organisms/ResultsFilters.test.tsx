import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResultsFilters, type ResultsFiltersProps } from './ResultsFilters'

function setup(overrides: Partial<ResultsFiltersProps> = {}) {
  const props: ResultsFiltersProps = {
    search: { value: '', onValueChange: vi.fn(), label: 'Buscar producto', placeholder: 'Buscar por nombre o código', clearLabel: 'Borrar búsqueda' },
    risk: {
      label: 'Riesgo',
      value: 'all',
      onValueChange: vi.fn(),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'critical', label: 'Crítico' },
      ],
    },
    abc: {
      label: 'Clase ABC',
      value: 'all',
      onValueChange: vi.fn(),
      options: [
        { value: 'all', label: 'Todas' },
        { value: 'A', label: 'A' },
      ],
    },
    ...overrides,
  }
  render(<ResultsFilters {...props} />)
  return props
}

describe('ResultsFilters', () => {
  it('renders search and both selects with accessible names', () => {
    setup()
    expect(screen.getByRole('textbox', { name: 'Buscar producto' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Riesgo' })).toHaveValue('all')
    expect(screen.getByRole('combobox', { name: 'Clase ABC' })).toHaveValue('all')
  })
  it('propagates search typing and select changes', async () => {
    const p = setup()
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar producto' }), 'a')
    expect(p.search.onValueChange).toHaveBeenCalledWith('a')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Riesgo' }), 'critical')
    expect(p.risk.onValueChange).toHaveBeenCalledWith('critical')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Clase ABC' }), 'A')
    expect(p.abc.onValueChange).toHaveBeenCalledWith('A')
  })
  it('shows the focus chip only when focus is active', async () => {
    const onReset = vi.fn()
    const { unmount } = render(
      <ResultsFilters
        search={{ value: '', onValueChange: () => {}, label: 'Buscar', clearLabel: 'Borrar' }}
        risk={{ label: 'Riesgo', value: 'all', onValueChange: () => {}, options: [{ value: 'all', label: 'Todos' }] }}
        abc={{ label: 'Clase ABC', value: 'all', onValueChange: () => {}, options: [{ value: 'all', label: 'Todas' }] }}
        focus={{ countText: '12 de 142 en foco', resetLabel: 'Restablecer', onReset }}
      />,
    )
    expect(screen.getByText('12 de 142 en foco')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(onReset).toHaveBeenCalled()
    unmount()
    setup()
    expect(screen.queryByRole('button', { name: 'Restablecer' })).toBeNull()
  })
  it('exposes a labelled search group', () => {
    setup({ groupLabel: 'Filtros' })
    expect(screen.getByRole('group', { name: 'Filtros' })).toBeInTheDocument()
  })
})
