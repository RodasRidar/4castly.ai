import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Components may only use design tokens. Raw hex colors, rgb()/hsl()/oklch() literals and Tailwind palette
 * utilities (bg-blue-600, text-emerald-500, ...) are allowed only in src/theme/tokens.css.
 */
const SRC = join(__dirname, '..')
const SKIP_DIRS = new Set(['theme', 'test', 'services'])
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PATTERNS: [string, RegExp][] = [
  ['hex color', /#[0-9a-fA-F]{3,8}\b/],
  ['color function', /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/],
  [
    'tailwind palette utility',
    new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)-(?:${PALETTE})-\\d{2,3}\\b`),
  ],
  ['black/white utility', /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b/],
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(entry) ? [] : files(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('token-only styling', () => {
  it.each(PATTERNS)('has no %s outside src/theme', (_label, pattern) => {
    const offenders = files(SRC).filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(SRC, f))).toEqual([])
  })

  it('uses text-faint only on decorative or disabled elements (it fails 4.5:1 as body text)', () => {
    const offenders = files(SRC).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ f, line, n: i + 1 }))
        .filter(({ line }) => /\btext-faint\b/.test(line) && !/aria-hidden|<Icon|disabled/.test(line))
        .map(({ f, n }) => `${relative(SRC, f)}:${n}`),
    )
    expect(offenders).toEqual([])
  })

  it('detects offenders (guard self-check)', () => {
    expect(PATTERNS.some(([, p]) => p.test('className="bg-blue-600 text-[#fff]"'))).toBe(true)
  })
})
