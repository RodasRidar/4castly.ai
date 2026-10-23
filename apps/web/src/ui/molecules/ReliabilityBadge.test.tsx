import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReliabilityBadge } from './ReliabilityBadge'

describe('ReliabilityBadge', () => {
  it.each([
    ['high', 'Alta', 3],
    ['medium', 'Media', 2],
    ['low', 'Baja', 1],
  ] as const)('renders %s as text first with %i filled marks', (level, label, filled) => {
    const { container } = render(<ReliabilityBadge level={level} label={label} />)
    const badge = screen.getByText(label).closest('[data-level]')
    expect(badge).toHaveAttribute('data-level', level)
    expect(badge?.firstElementChild).toHaveTextContent(label)
    expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(filled)
    expect(container.querySelectorAll('[data-filled]')).toHaveLength(3)
  })
  it('does not use status colors', () => {
    render(<ReliabilityBadge level="low" label="Baja" />)
    expect(screen.getByText('Baja').closest('[data-level]')?.className).not.toMatch(/critical|optimal|medium-/)
  })
})
