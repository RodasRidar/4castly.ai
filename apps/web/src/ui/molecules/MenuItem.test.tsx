import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Trash2 } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { describe, expect, it, vi } from 'vitest'
import { MenuItem } from './MenuItem'

describe('MenuItem', () => {
  it('has role menuitem and its label as name', () => {
    render(<MenuItem label="Renombrar" />)
    expect(screen.getByRole('menuitem', { name: 'Renombrar' })).toBeInTheDocument()
  })
  it('renders an optional icon as decorative', () => {
    render(<MenuItem label="Eliminar" icon={Trash2} />)
    expect(screen.getByRole('menuitem', { name: 'Eliminar' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('marks danger', () => {
    render(<MenuItem label="Eliminar" danger />)
    expect(screen.getByRole('menuitem')).toHaveAttribute('data-danger', 'true')
  })
  it('fires onClick standalone and by keyboard', async () => {
    const onClick = vi.fn()
    render(<MenuItem label="Fijar" onClick={onClick} />)
    await userEvent.click(screen.getByRole('menuitem'))
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })
  it('does not fire when disabled and exposes aria-disabled', async () => {
    const onClick = vi.fn()
    render(<MenuItem label="Archivar" disabled onClick={onClick} />)
    const item = screen.getByRole('menuitem')
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(item)
    expect(onClick).not.toHaveBeenCalled()
  })
  it('works inside Radix DropdownMenu.Item asChild', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu.Root open>
        <DropdownMenu.Trigger>t</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item asChild onSelect={onSelect}>
              <MenuItem label="Fijar" />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>,
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Fijar' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
