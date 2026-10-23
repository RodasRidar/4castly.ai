import { describe, expect, it } from 'vitest'
import { formatBytes, historyParts } from './format'

describe('formatBytes', () => {
  it('uses KB below 1 MB and MB above', () => {
    expect(formatBytes(482_113, 'es')).toBe('471 KB')
    expect(formatBytes(1_258_291, 'es')).toBe('1,2 MB')
    expect(formatBytes(1_258_291, 'en')).toBe('1.2 MB')
  })
})

describe('historyParts', () => {
  it.each([
    [40, { years: 0, months: 9 }],
    [117, { years: 2, months: 3 }],
    [143, { years: 2, months: 9 }],
    [2, { years: 0, months: 1 }],
  ])('%i weeks -> %j', (weeks, expected) => expect(historyParts(weeks)).toEqual(expected))
})
