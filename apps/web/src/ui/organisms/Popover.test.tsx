import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Popover } from './Popover'

describe('Popover', () => {
  it('opens from its trigger, exposes content and closes with Escape returning focus', async () => {
    render(
      <Popover trigger={<button>Perfil</button>} label="Menú de usuario">
        <p>ana@acme.com</p>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Perfil' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Menú de usuario' })).toHaveTextContent('ana@acme.com')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
