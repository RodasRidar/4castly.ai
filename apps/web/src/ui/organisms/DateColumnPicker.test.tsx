import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateColumnPicker, type DateColumnPickerProps } from './DateColumnPicker'

const columns = [
  { id: 'c1', name: 'Fecha de emisión', samples: ['02/01/2024', '03/01/2024'] },
  { id: 'c2', name: 'Fecha de vencimiento', samples: ['2026-01-31'] },
  { id: 'c3', name: 'Periodo', samples: ['2024-01', '2024-02'] },
]
const base = { label: 'Columnas con fechas', noDatesLabel: 'Mi archivo no tiene fechas' }

function setup(props: Partial<DateColumnPickerProps> = {}) {
  const onSelect = vi.fn()
  const onNoDates = vi.fn()
  render(<DateColumnPicker columns={columns} {...base} onSelect={onSelect} onNoDates={onNoDates} {...props} />)
  return { onSelect, onNoDates }
}

describe('DateColumnPicker', () => {
  it('renders a labelled listbox with options and their samples', () => {
    setup()
    const list = screen.getByRole('listbox', { name: base.label })
    const options = within(list).getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveAccessibleName(/Fecha de emisión/)
    expect(within(options[0]!).getByText('02/01/2024, 03/01/2024')).toHaveClass('font-mono')
  })
  it('reflects the selected value with aria-selected', () => {
    setup({ value: 'c2' })
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })
  it('selects on click', async () => {
    const { onSelect } = setup()
    await userEvent.click(screen.getAllByRole('option')[2]!)
    expect(onSelect).toHaveBeenCalledWith('c3')
  })
  it('navigates with arrow keys and selects with Enter or Space', async () => {
    const { onSelect } = setup()
    const list = screen.getByRole('listbox')
    await userEvent.tab()
    expect(list).toHaveFocus()
    const ids = screen.getAllByRole('option').map((o) => o.id)
    expect(list).toHaveAttribute('aria-activedescendant', ids[0])
    await userEvent.keyboard('{ArrowDown}')
    expect(list).toHaveAttribute('aria-activedescendant', ids[1])
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(list).toHaveAttribute('aria-activedescendant', ids[2])
    await userEvent.keyboard('{ArrowUp}')
    expect(list).toHaveAttribute('aria-activedescendant', ids[1])
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('c2')
    await userEvent.keyboard('{End}')
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenLastCalledWith('c3')
    await userEvent.keyboard('{Home}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith('c1')
  })
  it('offers the no-dates secondary action', async () => {
    const { onNoDates } = setup()
    await userEvent.click(screen.getByRole('button', { name: base.noDatesLabel }))
    expect(onNoDates).toHaveBeenCalledTimes(1)
  })
  it('empty: shows the empty text instead of a listbox but keeps the no-dates action', () => {
    setup({ columns: [], emptyText: 'No encontré columnas con fechas' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText('No encontré columnas con fechas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: base.noDatesLabel })).toBeInTheDocument()
  })
  it('disabled: blocks selection', async () => {
    const { onSelect } = setup({ disabled: true })
    await userEvent.click(screen.getAllByRole('option')[0]!)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: base.noDatesLabel })).toBeDisabled()
  })
})
