import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenu } from 'radix-ui'
import { describe, expect, it, vi } from 'vitest'
import { UserCard } from './UserCard'

describe('UserCard', () => {
  it('is a button named by user and company', () => {
    render(<UserCard name="Marta Quispe" company="Química Andina S.A." />)
    expect(screen.getByRole('button', { name: 'Marta Quispe Química Andina S.A.' })).toBeInTheDocument()
  })
  it('shows initials via the avatar', () => {
    render(<UserCard name="Marta Quispe" company="Química Andina S.A." />)
    expect(screen.getByText('MQ')).toBeInTheDocument()
  })
  it('forwards aria-haspopup and aria-expanded', () => {
    render(<UserCard name="Marta Quispe" company="X" aria-haspopup="menu" aria-expanded={true} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
  it('fires onClick via keyboard', async () => {
    const onClick = vi.fn()
    render(<UserCard name="Marta Quispe" company="X" onClick={onClick} />)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('works as a Radix DropdownMenu trigger', async () => {
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <UserCard name="Marta Quispe" company="X" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>Salir</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>,
    )
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Salir' })).toBeInTheDocument()
  })
})
