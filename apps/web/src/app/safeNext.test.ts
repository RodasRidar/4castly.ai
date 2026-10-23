import { describe, expect, it } from 'vitest'
import { safeNext } from './safeNext'

describe('safeNext', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNext('/c/c1?vista=portafolio#x')).toBe('/c/c1?vista=portafolio#x')
  })
  it.each([null, '', 'historial', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'falls back for %s',
    (raw) => expect(safeNext(raw)).toBe('/nuevo'),
  )
})
