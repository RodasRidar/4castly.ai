import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('toggles with click and Space and reports the change', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Fila 1" onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole('checkbox', { name: 'Fila 1' })
    await userEvent.click(el)
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true)
    expect(onCheckedChange).toHaveBeenNthCalledWith(2, false)
  })
  it('exposes checked and indeterminate states', () => {
    const { rerender } = render(<Checkbox aria-label="x" checked />)
    expect(screen.getByRole('checkbox')).toBeChecked()
    rerender(<Checkbox aria-label="x" checked="indeterminate" />)
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed')
  })
  it('is disabled', () => {
    render(<Checkbox aria-label="x" disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
