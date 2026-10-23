import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('mark only is named 4Castly', () => {
    render(<Logo variant="mark" />)
    expect(screen.getByRole('img', { name: '4Castly' })).toBeInTheDocument()
    expect(screen.queryByText('4Castly')).toBeNull()
  })
  it('mark with wordmark shows the text once', () => {
    render(<Logo variant="full" />)
    expect(screen.getByText('4Castly')).toBeInTheDocument()
    expect(screen.getAllByText('4C')).toHaveLength(1)
  })
})
