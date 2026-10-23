import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('announces progress with a status role and label', () => {
    render(<Spinner label="Cargando" />)
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument()
  })
  it('can be decorative inside a labelled control', () => {
    const { container } = render(<Spinner decorative />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).toBeNull()
  })
  it.each(['sm', 'md'] as const)('renders size %s', (size) => {
    const { container } = render(<Spinner decorative size={size} />)
    expect(container.firstChild).toHaveAttribute('data-size', size)
  })
})
