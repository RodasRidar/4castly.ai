/** Human file size: KB below 1 MB, MB above, in the UI locale. */
export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / 1_048_576
  if (mb >= 1) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(mb)} MB`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
}

/** Date-only ISO strings are calendar dates; format them in UTC so the day never shifts with the time zone. */
export function formatCalendarDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
}

/** Weeks of history as whole years and months (at least one month), for sentences like "2 años y 9 meses". */
export function historyParts(weeks: number): { years: number; months: number } {
  const total = Math.max(1, Math.round((weeks * 7) / 30.44))
  return { years: Math.floor(total / 12), months: total % 12 }
}
