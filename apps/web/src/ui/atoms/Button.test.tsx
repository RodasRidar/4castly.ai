import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('has the button role and accessible name, and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Continuar</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('activates with Enter and Space', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Ok</Button>)
    screen.getByRole('button').focus()
    await userEvent.keyboard('{Enter} ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })
  it.each(['primary', 'secondary', 'ghost', 'danger-text'] as const)('renders variant %s', (variant) => {
    render(<Button variant={variant}>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant)
  })
  it('is inert and busy while loading', async () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Enviar</Button>)
    const b = screen.getByRole('button', { name: 'Enviar' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })
  it('is disabled', () => {
    render(<Button disabled>x</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
  it('renders icons left and right outside the accessible name', () => {
    render(<Button iconLeft={<svg data-testid="l" />} iconRight={<svg data-testid="r" />}>Go</Button>)
    expect(screen.getByTestId('l')).toBeInTheDocument()
    expect(screen.getByTestId('r')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
  })
  it('defaults to type=button', () => {
    render(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
