import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatLine } from './StatLine'

describe('StatLine', () => {
  it('pairs the label with the value as a term/definition', () => {
    render(<StatLine label="Plazo de entrega" value="45 días" />)
    expect(screen.getByText('Plazo de entrega').tagName).toBe('DT')
    expect(screen.getByText('45 días').tagName).toBe('DD')
  })
  it('accepts node values', () => {
    render(<StatLine label="Stock" value={<strong>120 u</strong>} />)
    expect(screen.getByText('120 u')).toBeInTheDocument()
  })
})
