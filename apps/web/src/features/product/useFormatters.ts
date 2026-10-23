import { useTranslation } from 'react-i18next'

/** Locale-aware formatters. Dates are calendar dates (no time of day), so they are formatted in UTC and never shift. */
export function useFormatters() {
  const { i18n } = useTranslation()
  const locale = i18n.language
  return {
    locale,
    date: (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)),
    shortDate: (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso)),
    number: (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value),
  }
}
