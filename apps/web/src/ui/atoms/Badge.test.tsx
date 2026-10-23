import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it.each(['neutral', 'soon', 'count'] as const)('renders tone %s with its text', (tone) => {
    render(<Badge tone={tone}>3</Badge>)
    expect(screen.getByText('3')).toHaveAttribute('data-tone', tone)
  })
})
