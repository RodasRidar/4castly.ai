import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../services/types'
import { annotateMarkdown } from './annotate'

type Annotation = NonNullable<ChatMessage['annotations']>[number]

const filter = (start: number, end: number, risk: 'critical' | 'medium' | 'optimal' = 'critical'): Annotation => ({
  start,
  end,
  type: 'filter',
  link: { q: null, risk, abc: null, count: 7 },
})
const product = (start: number, end: number, code: string): Annotation => ({ start, end, type: 'product', code })

const TEXT = '7 productos críticos. Empieza por Acetona grado reactivo y Ácido cítrico anhidro.'

describe('annotateMarkdown', () => {
  it('turns filter and product spans into links to the results and the product', () => {
    const md = annotateMarkdown(TEXT, [filter(0, 20), product(34, 56, 'QF-0011'), product(59, 80, 'QF-0001')], 'c-1')
    expect(md).toBe(
      '[7 productos críticos](/c/c-1?riesgo=critical). Empieza por [Acetona grado reactivo](/c/c-1/productos/QF-0011) y [Ácido cítrico anhidro](/c/c-1/productos/QF-0001).',
    )
  })

  it('returns the text unchanged without annotations', () => {
    expect(annotateMarkdown(TEXT, [], 'c-1')).toBe(TEXT)
    expect(annotateMarkdown(TEXT, undefined, 'c-1')).toBe(TEXT)
  })

  it('ignores annotations outside the text, empty, reversed or non-integer', () => {
    const md = annotateMarkdown(TEXT, [filter(0, 999), filter(5, 5), filter(10, 3), filter(-1, 4), filter(0.5, 3)], 'c-1')
    expect(md).toBe(TEXT)
  })

  it('keeps the first of two overlapping annotations', () => {
    const md = annotateMarkdown('abcdefghij', [product(0, 6, 'A'), product(4, 9, 'B')], 'c-1')
    expect(md).toBe('[abcdef](/c/c-1/productos/A)ghij')
  })

  it('works when annotations arrive out of order', () => {
    const md = annotateMarkdown('abcdefghij', [product(6, 9, 'B'), product(0, 3, 'A')], 'c-1')
    expect(md).toBe('[abc](/c/c-1/productos/A)def[ghi](/c/c-1/productos/B)j')
  })

  it('escapes brackets inside a span and url-encodes the product code', () => {
    expect(annotateMarkdown('ver [x] ya', [product(4, 7, 'A B/1')], 'c-1')).toBe('ver [\\[x\\]](/c/c-1/productos/A%20B%2F1) ya')
  })

  it('ignores a span that would cut a surrogate pair', () => {
    const text = 'a😀b'
    expect(annotateMarkdown(text, [product(0, 2, 'A')], 'c-1')).toBe(text)
    expect(annotateMarkdown(text, [product(1, 3, 'A')], 'c-1')).toBe('a[😀](/c/c-1/productos/A)b')
  })
})
