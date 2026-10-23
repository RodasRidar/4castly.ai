import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NumberStepper } from './NumberStepper'

const labels = { label: 'Cobertura objetivo', decrementLabel: 'Disminuir', incrementLabel: 'Aumentar' }

function Harness({ initial = 5, min, max }: { initial?: number; min?: number; max?: number }) {
  const [v, setV] = useState(initial)
  return <NumberStepper {...labels} value={v} onChange={setV} unit="sem" min={min} max={max} />
}

describe('NumberStepper', () => {
  it('exposes a spinbutton with value, bounds and unit', () => {
    render(<Harness min={1} max={12} />)
    const sb = screen.getByRole('spinbutton', { name: 'Cobertura objetivo' })
    expect(sb).toHaveAttribute('aria-valuenow', '5')
    expect(sb).toHaveAttribute('aria-valuemin', '1')
    expect(sb).toHaveAttribute('aria-valuemax', '12')
    expect(sb).toHaveAttribute('aria-valuetext', '5 sem')
    expect(sb).toHaveTextContent('5 sem')
  })
  it('buttons step the value', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar' }))
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '6')
    await userEvent.click(screen.getByRole('button', { name: 'Disminuir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Disminuir' }))
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '4')
  })
  it('disables the buttons at the limits', () => {
    const { rerender } = render(<NumberStepper {...labels} value={1} onChange={() => {}} min={1} max={3} />)
    expect(screen.getByRole('button', { name: 'Disminuir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeEnabled()
    rerender(<NumberStepper {...labels} value={3} onChange={() => {}} min={1} max={3} />)
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeDisabled()
  })
  it('Arrow keys, Home and End change the value within bounds', async () => {
    render(<Harness initial={2} min={1} max={4} />)
    screen.getByRole('spinbutton').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '3')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '1')
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '4')
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuenow', '4')
  })
  it('does not call onChange when disabled', async () => {
    const onChange = vi.fn()
    render(<NumberStepper {...labels} value={2} onChange={onChange} disabled />)
    expect(screen.getByRole('button', { name: 'Aumentar' })).toBeDisabled()
    screen.getByRole('spinbutton').focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(onChange).not.toHaveBeenCalled()
  })
})
