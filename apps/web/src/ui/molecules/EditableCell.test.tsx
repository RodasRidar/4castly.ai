import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditableCell } from './EditableCell'

const labels = { editLabel: 'Editar plazo de entrega', inputLabel: 'Plazo de entrega en días' }

describe('EditableCell', () => {
  it('display state shows the value with unit and an edit button', () => {
    render(<EditableCell {...labels} value={45} unit="d" onCommit={() => {}} />)
    const btn = screen.getByRole('button', { name: /Editar plazo de entrega/ })
    expect(btn).toHaveTextContent('45 d')
  })
  it('Enter commits the new number and leaves editing', async () => {
    const onCommit = vi.fn()
    render(<EditableCell {...labels} value={45} onCommit={onCommit} />)
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    const input = screen.getByRole('spinbutton', { name: 'Plazo de entrega en días' })
    expect(input).toHaveFocus()
    expect(input).toHaveValue(45)
    await userEvent.clear(input)
    await userEvent.type(input, '60{Enter}')
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(60)
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
  it('Escape cancels without committing', async () => {
    const onCommit = vi.fn()
    render(<EditableCell {...labels} value={45} onCommit={onCommit} />)
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    await userEvent.type(screen.getByRole('spinbutton'), '9{Escape}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Editar/ })).toHaveTextContent('45')
  })
  it('does not commit an unchanged or invalid value', async () => {
    const onCommit = vi.fn()
    render(<EditableCell {...labels} value={45} min={1} onCommit={onCommit} />)
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    await userEvent.keyboard('{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    await userEvent.clear(screen.getByRole('spinbutton'))
    await userEvent.keyboard('{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-invalid', 'true')
  })
  it('blur commits', async () => {
    const onCommit = vi.fn()
    render(
      <>
        <EditableCell {...labels} value={45} onCommit={onCommit} />
        <button>otro</button>
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    await userEvent.type(screen.getByRole('spinbutton'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'otro' }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(451)
  })
  it('saving state is busy and not editable', () => {
    render(<EditableCell {...labels} value={60} status="saving" savingText="Guardando" onCommit={() => {}} />)
    expect(screen.getByRole('button', { name: /Editar/ })).toBeDisabled()
    expect(screen.getByText('Guardando')).toBeInTheDocument()
  })
  it('error state shows the message and can be edited again', async () => {
    render(<EditableCell {...labels} value={45} status="error" errorText="No se pudo guardar" onCommit={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })
})
