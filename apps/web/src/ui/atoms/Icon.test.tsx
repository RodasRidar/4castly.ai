import { render, screen } from '@testing-library/react'
import { Search } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'

describe('Icon', () => {
  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<Icon icon={Search} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('exposes a name as an image when labelled', () => {
    render(<Icon icon={Search} label="Buscar" />)
    expect(screen.getByRole('img', { name: 'Buscar' })).toBeInTheDocument()
  })
  it.each([['sm', '14'], ['md', '16'], ['lg', '20']] as const)('size %s is %s px', (size, px) => {
    const { container } = render(<Icon icon={Search} size={size} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', px)
  })
})
