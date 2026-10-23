import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DateValue } from './DateValue'

const date = new Date('2026-10-20T12:00:00Z')
const now = new Date('2026-10-23T12:00:00Z')

describe('DateValue', () => {
  it('renders a localized absolute date in a time element', () => {
    render(<DateValue date={date} locale="en" timeZone="UTC" />)
    const el = screen.getByText('Oct 20, 2026')
    expect(el.tagName).toBe('TIME')
    expect(el).toHaveAttribute('datetime', date.toISOString())
  })
  it('renders a relative date in Spanish', () => {
    render(<DateValue date={date} mode="relative" now={now} locale="es" />)
    expect(screen.getByText('hace 3 días')).toBeInTheDocument()
  })
  it('keeps the absolute date as title for relative mode', () => {
    render(<DateValue date={date} mode="relative" now={now} locale="es" timeZone="UTC" />)
    expect(screen.getByText('hace 3 días')).toHaveAttribute('title')
  })
})
