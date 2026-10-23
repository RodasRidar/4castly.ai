import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from './OtpInput'

const cellLabel = (i: number) => `Dígito ${i + 1}`
const setup = (props: Partial<React.ComponentProps<typeof OtpInput>> = {}) =>
  render(<OtpInput groupLabel="Código de verificación" cellLabel={cellLabel} onComplete={() => {}} {...props} />)

describe('OtpInput', () => {
  it('renders a labelled group of 6 cells', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Código de verificación' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    expect(screen.getByRole('textbox', { name: 'Dígito 3' })).toBeInTheDocument()
  })
  it('auto-advances and completes', async () => {
    const onComplete = vi.fn()
    setup({ onComplete })
    await userEvent.click(screen.getByRole('textbox', { name: 'Dígito 1' }))
    await userEvent.keyboard('12345')
    expect(screen.getByRole('textbox', { name: 'Dígito 6' })).toHaveFocus()
    expect(onComplete).not.toHaveBeenCalled()
    await userEvent.keyboard('6')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456')
  })
  it('ignores non-digits', async () => {
    setup()
    await userEvent.click(screen.getByRole('textbox', { name: 'Dígito 1' }))
    await userEvent.keyboard('a')
    expect(screen.getByRole('textbox', { name: 'Dígito 1' })).toHaveValue('')
  })
  it('pastes a 6-digit code across the cells', async () => {
    const onComplete = vi.fn()
    setup({ onComplete })
    await userEvent.click(screen.getByRole('textbox', { name: 'Dígito 1' }))
    await userEvent.paste('654 321')
    const values = screen.getAllByRole('textbox').map((c) => (c as HTMLInputElement).value)
    expect(values).toEqual(['6', '5', '4', '3', '2', '1'])
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('654321')
  })
  it('backspace on an empty cell moves to and clears the previous one', async () => {
    setup()
    await userEvent.click(screen.getByRole('textbox', { name: 'Dígito 1' }))
    await userEvent.keyboard('12')
    expect(screen.getByRole('textbox', { name: 'Dígito 3' })).toHaveFocus()
    await userEvent.keyboard('{Backspace}')
    expect(screen.getByRole('textbox', { name: 'Dígito 2' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Dígito 2' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Dígito 1' })).toHaveValue('1')
  })
  it('marks every cell invalid and supports controlled reset', () => {
    const { rerender } = setup({ value: '123456', invalid: true })
    for (const c of screen.getAllByRole('textbox')) expect(c).toHaveAttribute('aria-invalid', 'true')
    rerender(<OtpInput groupLabel="Código" cellLabel={cellLabel} onComplete={() => {}} value="" />)
    for (const c of screen.getAllByRole('textbox')) expect(c).toHaveValue('')
  })
  it('disables all cells', () => {
    setup({ disabled: true })
    for (const c of screen.getAllByRole('textbox')) expect(c).toBeDisabled()
  })
})
