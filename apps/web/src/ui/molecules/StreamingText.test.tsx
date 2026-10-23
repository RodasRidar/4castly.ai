import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StreamingText } from './StreamingText'

describe('StreamingText', () => {
  it('renders plain markdown text', () => {
    render(<StreamingText>{'Hay **3** productos en riesgo.'}</StreamingText>)
    expect(screen.getByText('3').tagName).toBe('STRONG')
  })
  it('renders lists', () => {
    render(<StreamingText>{'- Ácido cítrico\n- Glicerina'}</StreamingText>)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
  it('renders GFM tables', () => {
    render(<StreamingText>{'| Producto | Cobertura |\n|---|---|\n| Glicerina | 12 días |'}</StreamingText>)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12 días' })).toBeInTheDocument()
  })
  it('is a polite live region', () => {
    const { container } = render(<StreamingText>{'hola'}</StreamingText>)
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite')
  })
  it('shows the cursor only while streaming, hidden from assistive tech and out of the text', () => {
    const { container, rerender } = render(<StreamingText streaming>{'hola'}</StreamingText>)
    const cursor = container.querySelector('[data-testid="streaming-cursor"]')
    expect(cursor).not.toBeNull()
    expect(cursor).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveTextContent(/^hola$/)
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
    rerender(<StreamingText>{'hola'}</StreamingText>)
    expect(container.querySelector('[data-testid="streaming-cursor"]')).toBeNull()
  })
  it('stops the blink for reduced motion', () => {
    const { container } = render(<StreamingText streaming>{'hola'}</StreamingText>)
    expect(container.querySelector('[data-testid="streaming-cursor"]')?.className).toContain('motion-reduce:animate-none')
  })
})
