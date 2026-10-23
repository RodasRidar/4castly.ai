import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Divider } from './Divider'

describe('Divider', () => {
  it('is a separator', () => {
    render(<Divider />)
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })
  it('shows a label in the middle', () => {
    render(<Divider label="Hoy" />)
    expect(screen.getByRole('separator')).toHaveTextContent('Hoy')
  })
})
