import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it.each(['processing', 'failed'] as const)('%s exposes a text alternative', (status) => {
    render(<StatusDot status={status} label={`estado ${status}`} />)
    expect(screen.getByRole('img', { name: `estado ${status}` })).toHaveAttribute('data-status', status)
  })
})
