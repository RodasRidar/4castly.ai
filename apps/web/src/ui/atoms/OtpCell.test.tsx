import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OtpCell } from './OtpCell'

describe('OtpCell', () => {
  it('is a numeric single-character field with a name', () => {
    render(<OtpCell aria-label="Dígito 1" value="" onChange={() => {}} />)
    const el = screen.getByRole('textbox', { name: 'Dígito 1' })
    expect(el).toHaveAttribute('inputmode', 'numeric')
    expect(el).toHaveAttribute('maxlength', '1')
  })
  it('reports typed characters', async () => {
    const seen: string[] = []
    render(<OtpCell aria-label="d" value="" onChange={(v) => seen.push(v)} />)
    await userEvent.type(screen.getByRole('textbox'), '7')
    expect(seen).toEqual(['7'])
  })
  it('shows the filled value and error state', () => {
    render(<OtpCell aria-label="d" value="4" onChange={() => {}} invalid />)
    expect(screen.getByRole('textbox')).toHaveValue('4')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })
})
