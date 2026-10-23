import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it.each(['line', 'block', 'circle'] as const)('renders shape %s as decorative', (shape) => {
    const { container } = render(<Skeleton shape={shape} />)
    expect(container.firstChild).toHaveAttribute('data-shape', shape)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})
