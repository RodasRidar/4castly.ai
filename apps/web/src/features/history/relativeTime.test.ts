import { describe, expect, it } from 'vitest'
import { formatActivity } from './relativeTime'

const now = new Date('2026-10-26T12:00:00Z').getTime()
const ago = (ms: number) => new Date(now - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatActivity', () => {
  it('says "now" for the last minute', () => {
    expect(formatActivity(ago(20_000), 'es', now)).toBe('ahora')
    expect(formatActivity(ago(20_000), 'en', now)).toBe('now')
  })

  it('uses minutes, hours and days in the active language', () => {
    expect(formatActivity(ago(5 * MIN), 'es', now)).toBe('hace 5 min')
    expect(formatActivity(ago(3 * HOUR), 'es', now)).toBe('hace 3 h')
    expect(formatActivity(ago(2 * DAY), 'es', now)).toBe('hace 2 días')
    expect(formatActivity(ago(2 * DAY), 'en', now)).toBe('2 days ago')
  })

  it('uses "yesterday" style wording for a single day', () => {
    expect(formatActivity(ago(DAY + HOUR), 'es', now)).toBe('ayer')
  })

  it('switches to a calendar date after 30 days', () => {
    expect(formatActivity(ago(45 * DAY), 'es', now)).toBe('11 sept 2026')
    expect(formatActivity(ago(45 * DAY), 'en', now)).toBe('Sep 11, 2026')
  })

  it('never shows the future: a clock skew reads as now', () => {
    expect(formatActivity(new Date(now + 5 * MIN).toISOString(), 'es', now)).toBe('ahora')
  })

  it('returns an empty string for an invalid date instead of "Invalid Date"', () => {
    expect(formatActivity('not-a-date', 'es', now)).toBe('')
  })
})
