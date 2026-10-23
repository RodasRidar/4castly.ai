import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RiskBadge } from './RiskBadge'

describe('RiskBadge', () => {
  it.each([
    ['critical', 'Crítico', 'text-critical'],
    ['medium', 'Medio', 'text-medium'],
    ['optimal', 'Óptimo', 'text-optimal'],
  ] as const)('renders %s with text, icon and status color', (level, label, cls) => {
    const { container } = render(<RiskBadge level={level} label={label} />)
    const badge = screen.getByText(label).closest('[data-level]')
    expect(badge).toHaveAttribute('data-level', level)
    expect(badge).toHaveClass(cls)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
