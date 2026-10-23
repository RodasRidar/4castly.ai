import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it('takes first and last initial, uppercased', () => {
    expect(initialsOf('ana maría pérez')).toBe('AP')
  })
  it('handles one word and empty input', () => {
    expect(initialsOf('Rodas')).toBe('R')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('Avatar', () => {
  it('shows initials and exposes the name', () => {
    render(<Avatar name="Ana Pérez" />)
    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveTextContent('AP')
  })
  it.each(['sm', 'md', 'lg'] as const)('renders size %s', (size) => {
    render(<Avatar name="Ana Pérez" size={size} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-size', size)
  })
})
