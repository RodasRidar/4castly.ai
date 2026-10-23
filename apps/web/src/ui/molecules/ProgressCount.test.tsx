import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressCount } from './ProgressCount'

describe('ProgressCount', () => {
  it('renders an indeterminate progressbar without a value', () => {
    render(<ProgressCount label="Calculando pronóstico" countText="87 de 142 productos" />)
    const bar = screen.getByRole('progressbar', { name: 'Calculando pronóstico' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).not.toHaveAttribute('aria-valuemin')
  })
  it('shows the count text from props', () => {
    render(<ProgressCount label="Calculando" countText="87 de 142 productos" />)
    expect(screen.getByText('87 de 142 productos')).toBeInTheDocument()
  })
  it('shows no percentage', () => {
    const { container } = render(<ProgressCount label="Calculando" countText="87 de 142 productos" />)
    expect(container).not.toHaveTextContent('%')
  })
  it('count text is optional', () => {
    render(<ProgressCount label="Calculando" />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
