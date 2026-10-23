import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('has the switch role, reflects state and toggles via click and Space', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Notificaciones" checked={false} onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole('switch', { name: 'Notificaciones' })
    expect(el).not.toBeChecked()
    await userEvent.click(el)
    el.focus()
    await userEvent.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
  it('shows on and disabled', () => {
    render(<Switch aria-label="x" checked disabled onCheckedChange={() => {}} />)
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
