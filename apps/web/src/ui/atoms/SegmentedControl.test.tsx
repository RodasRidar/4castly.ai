import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const options = [{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }, { value: 'system', label: 'Sistema' }]

describe('SegmentedControl', () => {
  it('is a radiogroup with the selected option checked', () => {
    render(<SegmentedControl aria-label="Tema" options={options} value="dark" onValueChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Claro' })).not.toBeChecked()
  })
  it('selects on click', async () => {
    const onValueChange = vi.fn()
    render(<SegmentedControl aria-label="Tema" options={options} value="light" onValueChange={onValueChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Sistema' }))
    expect(onValueChange).toHaveBeenCalledWith('system')
  })
  it('moves focus with arrow keys and selects with Space', async () => {
    const onValueChange = vi.fn()
    render(<SegmentedControl aria-label="Tema" options={options} value="light" onValueChange={onValueChange} />)
    screen.getByRole('radio', { name: 'Claro' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveFocus())
    await userEvent.keyboard(' ')
    expect(onValueChange).toHaveBeenCalledWith('dark')
  })
})
