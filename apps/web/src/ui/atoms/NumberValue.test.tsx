import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberValue } from './NumberValue'

describe('NumberValue', () => {
  it('formats with the es locale and appends the unit', () => {
    render(<NumberValue value={12345.5} unit="u" locale="es" />)
    expect(screen.getByText('12.345,5 u')).toBeInTheDocument()
  })
  it('formats with the en locale', () => {
    render(<NumberValue value={12345.5} locale="en" />)
    expect(screen.getByText('12,345.5')).toBeInTheDocument()
  })
  it('renders a range with an en dash', () => {
    render(<NumberValue range={[280, 310]} unit="u" locale="en" />)
    expect(screen.getByText('280–310 u')).toBeInTheDocument()
  })
  it('renders a dash placeholder when empty', () => {
    render(<NumberValue value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('uses the mono font', () => {
    render(<NumberValue value={1} />)
    expect(screen.getByText('1').className).toContain('font-mono')
  })
})
