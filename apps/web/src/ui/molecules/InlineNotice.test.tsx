import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineNotice } from './InlineNotice'

describe('InlineNotice', () => {
  it.each(['info', 'warning', 'staleness'] as const)('%s renders its content with a tone marker', (tone) => {
    render(<InlineNotice tone={tone}>Falta stock para 3 productos.</InlineNotice>)
    const el = screen.getByText('Falta stock para 3 productos.').closest('[data-tone]')
    expect(el).toHaveAttribute('data-tone', tone)
  })
  it('renders an optional title', () => {
    render(<InlineNotice tone="warning" title="Revisa estos datos">cuerpo</InlineNotice>)
    expect(screen.getByText('Revisa estos datos')).toBeInTheDocument()
  })
  it('warning uses medium tokens, info does not', () => {
    const { rerender } = render(<InlineNotice tone="warning">x</InlineNotice>)
    expect(screen.getByText('x').closest('[data-tone]')?.className).toContain('bg-medium-bg')
    rerender(<InlineNotice tone="info">x</InlineNotice>)
    expect(screen.getByText('x').closest('[data-tone]')?.className).not.toContain('medium')
  })
  it('has a note/status role', () => {
    render(<InlineNotice tone="info">x</InlineNotice>)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})
