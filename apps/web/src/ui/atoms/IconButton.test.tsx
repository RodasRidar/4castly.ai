import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('uses the required label as accessible name', () => {
    render(<IconButton label="Buscar" icon={Search} />)
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
  })
  it('shows the label as a tooltip on keyboard focus', async () => {
    render(<IconButton label="Buscar" icon={Search} />)
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Buscar')
  })
  it('fires onClick and respects disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<IconButton label="x" icon={Search} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<IconButton label="x" icon={Search} onClick={onClick} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
  it.each(['ghost', 'outline'] as const)('renders variant %s', (variant) => {
    render(<IconButton label="x" icon={Search} variant={variant} />)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant)
  })
})
