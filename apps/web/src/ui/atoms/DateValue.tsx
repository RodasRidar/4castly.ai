import { useState } from 'react'

interface DateValueProps {
  date: Date
  mode?: 'date' | 'relative'
  locale?: string
  timeZone?: string
  /** Reference instant for relative mode; injectable for deterministic output. */
  now?: Date
  className?: string
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

function relative(date: Date, now: Date, locale: string): string {
  const diff = (date.getTime() - now.getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.trunc(diff / seconds), unit)
  }
  return rtf.format(Math.trunc(diff), 'second')
}

export function DateValue({ date, mode = 'date', locale = 'es', timeZone, now, className }: DateValueProps) {
  const [fallbackNow] = useState(() => new Date())
  const reference = now ?? fallbackNow
  const absolute = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date)
  return (
    <time dateTime={date.toISOString()} title={mode === 'relative' ? absolute : undefined} className={className}>
      {mode === 'relative' ? relative(date, reference, locale) : absolute}
    </time>
  )
}
