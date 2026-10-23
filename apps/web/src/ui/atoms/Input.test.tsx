import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('has a textbox role named by its aria-label and accepts typing', async () => {
    render(<Input aria-label="Correo" />)
    const el = screen.getByRole('textbox', { name: 'Correo' })
    await userEvent.type(el, 'a@b.co')
    expect(el).toHaveValue('a@b.co')
  })
  it('flags error state for assistive tech', () => {
    render(<Input aria-label="x" invalid />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })
  it('read-only blocks typing and shows a lock', async () => {
    render(<Input aria-label="Empresa" readOnly defaultValue="Acme" />)
    const el = screen.getByRole('textbox')
    await userEvent.type(el, 'zzz')
    expect(el).toHaveValue('Acme')
    expect(el).toHaveAttribute('readonly')
    expect(screen.getByTestId('input-lock')).toBeInTheDocument()
  })
  it('is disabled', () => {
    render(<Input aria-label="x" disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
  it('renders a leading icon', () => {
    render(<Input aria-label="x" leadingIcon={Search} />)
    expect(screen.getByTestId('input-leading-icon')).toBeInTheDocument()
  })
})
