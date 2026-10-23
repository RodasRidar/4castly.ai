import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('merges conflicting utilities, last wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
  it('keeps a custom font-size and a custom color together', () => {
    expect(cn('text-body-md', 'text-ink')).toBe('text-body-md text-ink')
  })
  it('still resolves conflicts between two token colors', () => {
    expect(cn('text-body', 'text-critical')).toBe('text-critical')
  })
  it('resolves conflicts between two token font sizes', () => {
    expect(cn('text-body-md', 'text-body-sm')).toBe('text-body-sm')
  })
  it('drops falsy values', () => {
    expect(cn('a', Math.random() > 2 && 'b', undefined, 'c')).toBe('a c')
  })
})
