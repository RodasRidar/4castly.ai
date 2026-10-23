import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

function block(selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`Missing ${selector} in tokens.css`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

function parse(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const themes = {
  light: parse(block(':root')),
  dark: { ...parse(block(':root')), ...parse(block('[data-theme="dark"]')) },
}

const surfaces = ['canvas', 'elevated', 'selected'] as const
const textTokens = ['ink', 'body', 'mute'] as const
const statuses = ['critical', 'medium', 'optimal'] as const

describe.each(Object.entries(themes))('%s theme tokens', (_name, t) => {
  it.each(surfaces.flatMap((s) => textTokens.map((x) => [x, s] as const)))(
    '%s on %s has at least 4.5:1',
    (fg, bg) => {
      expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(
    statuses.flatMap((status) => [...surfaces, `${status}-bg` as const].map((bg) => [status, bg] as const)),
  )('status %s foreground on %s has at least 4.5:1', (status, bg) => {
    expect(contrastRatio(t[status], t[bg])).toBeGreaterThanOrEqual(4.5)
  })

  it('primary button label on primary has at least 4.5:1', () => {
    expect(contrastRatio(t['primary-fg'], t.primary)).toBeGreaterThanOrEqual(4.5)
  })

  it('focus ring has at least 3:1 against every surface (non-text, WCAG 1.4.11)', () => {
    for (const s of surfaces) expect(contrastRatio(t['focus-ring'], t[s])).toBeGreaterThanOrEqual(3)
  })

  it('defines no blue link token', () => {
    expect(Object.keys(t).some((k) => k.includes('link'))).toBe(false)
  })
})

describe('theme parity', () => {
  it('dark overrides only tokens that exist in light', () => {
    const light = Object.keys(themes.light)
    for (const key of Object.keys(parse(block('[data-theme="dark"]')))) expect(light).toContain(key)
  })
})
