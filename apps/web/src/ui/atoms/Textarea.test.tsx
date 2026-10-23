import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('is a named textbox that accepts multi-line text', async () => {
    render(<Textarea aria-label="Mensaje" />)
    const el = screen.getByRole('textbox', { name: 'Mensaje' })
    await userEvent.type(el, 'a{Shift>}{Enter}{/Shift}b')
    expect(el).toHaveValue('a\nb')
  })
  it('caps its height at maxRows', () => {
    render(<Textarea aria-label="x" maxRows={4} />)
    expect(screen.getByRole('textbox')).toHaveStyle({ maxHeight: '80px' })
  })
  it('is disabled', () => {
    render(<Textarea aria-label="x" disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})
