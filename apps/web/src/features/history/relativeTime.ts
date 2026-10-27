const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "hace 5 min", "ayer", "hace 2 días", then a calendar date after 30 days. Dates are shown in UTC so a
 * conversation never moves to another day depending on where the user is.
 */
export function formatActivity(iso: string, locale: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const elapsed = Math.max(0, now - time)

  if (elapsed < MINUTE) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second')
  if (elapsed < HOUR) return new Intl.RelativeTimeFormat(locale, { style: 'short' }).format(-Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return new Intl.RelativeTimeFormat(locale, { style: 'short' }).format(-Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < 30 * DAY) {
    const days = Math.floor(elapsed / DAY)
    // "ayer" for one day, but "hace 2 días" rather than "anteayer" for two.
    return new Intl.RelativeTimeFormat(locale, { numeric: days === 1 ? 'auto' : 'always' }).format(-days, 'day')
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(time)
}
