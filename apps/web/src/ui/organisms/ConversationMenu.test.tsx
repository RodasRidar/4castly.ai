import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConversationMenu, type ConversationMenuProps } from './ConversationMenu'

const props = (over: Partial<ConversationMenuProps> = {}): ConversationMenuProps => ({
  triggerLabel: 'Opciones de la conversación',
  pinLabel: 'Fijar',
  unpinLabel: 'Desfijar',
  renameLabel: 'Renombrar',
  archiveLabel: 'Archivar',
  deleteLabel: 'Eliminar',
  confirmTitle: 'Eliminar conversación',
  confirmDescription: 'Esta acción no se puede deshacer.',
  confirmLabel: 'Eliminar definitivamente',
  cancelLabel: 'Cancelar',
  closeLabel: 'Cerrar',
  onPin: vi.fn(),
  onRename: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  ...over,
})

const open = async () => {
  const trigger = screen.getByRole('button', { name: 'Opciones de la conversación' })
  await userEvent.click(trigger)
  return trigger
}

describe('ConversationMenu', () => {
  it('opens a menu with the four actions', async () => {
    render(<ConversationMenu {...props()} />)
    await open()
    for (const name of ['Fijar', 'Renombrar', 'Archivar', 'Eliminar']) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
  })
  it('shows the unpin label when pinned', async () => {
    render(<ConversationMenu {...props({ pinned: true })} />)
    await open()
    expect(await screen.findByRole('menuitem', { name: 'Desfijar' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Fijar' })).not.toBeInTheDocument()
  })
  it.each([
    ['Fijar', 'onPin'],
    ['Renombrar', 'onRename'],
    ['Archivar', 'onArchive'],
  ] as const)('%s fires %s', async (name, handler) => {
    const p = props()
    render(<ConversationMenu {...p} />)
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name }))
    expect(p[handler]).toHaveBeenCalledOnce()
    expect(p.onDelete).not.toHaveBeenCalled()
  })
  it('is keyboard operable', async () => {
    const p = props()
    render(<ConversationMenu {...p} />)
    screen.getByRole('button', { name: 'Opciones de la conversación' }).focus()
    await userEvent.keyboard('{Enter}')
    const first = await screen.findByRole('menuitem', { name: 'Fijar' })
    await waitFor(() => expect(first).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(p.onRename).toHaveBeenCalledOnce()
  })
  it('asks for confirmation before deleting', async () => {
    const p = props()
    render(<ConversationMenu {...p} />)
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }))
    const dlg = await screen.findByRole('dialog', { name: 'Eliminar conversación' })
    expect(p.onDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))
    expect(p.onDelete).toHaveBeenCalledOnce()
    expect(dlg).not.toBeInTheDocument()
  })
  it('cancel closes the dialog without deleting and returns focus to the trigger', async () => {
    const p = props()
    render(<ConversationMenu {...p} />)
    const trigger = await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(p.onDelete).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })
})
