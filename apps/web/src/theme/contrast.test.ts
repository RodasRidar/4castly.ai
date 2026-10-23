import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('is 1 for identical colors', () => {
    expect(contrastRatio('#8f8f8f', '#8f8f8f')).toBeCloseTo(1, 5)
  })

  it('rejects non-hex input', () => {
    expect(() => contrastRatio('red', '#fff')).toThrow()
  })
})
