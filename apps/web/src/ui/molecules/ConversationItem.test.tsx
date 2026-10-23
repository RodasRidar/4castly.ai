import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoreHorizontal } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from '../atoms/IconButton'
import { ConversationItem } from './ConversationItem'

const base = { title: 'Pronóstico de ácido cítrico' }

describe('ConversationItem', () => {
  it('renders a link when href is given', () => {
    render(<ConversationItem {...base} href="/c/1" />)
    expect(screen.getByRole('link', { name: base.title })).toHaveAttribute('href', '/c/1')
  })
  it('renders a button and fires onSelect when no href', async () => {
    const onSelect = vi.fn()
    render(<ConversationItem {...base} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: base.title }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
  it('sets aria-current=page only when active', () => {
    const { rerender } = render(<ConversationItem {...base} href="/c/1" />)
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current')
    rerender(<ConversationItem {...base} href="/c/1" active />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  })
  it('shows a pinned indicator with its label', () => {
    render(<ConversationItem {...base} href="/c/1" pinned pinnedLabel="Fijada" />)
    expect(screen.getByRole('img', { name: 'Fijada' })).toBeInTheDocument()
  })
  it.each(['processing', 'failed'] as const)('shows the %s status dot', (status) => {
    render(<ConversationItem {...base} href="/c/1" status={status} statusLabel="Estado" />)
    expect(screen.getByRole('img', { name: 'Estado' })).toHaveAttribute('data-status', status)
  })
  it('renders the menu slot', () => {
    render(<ConversationItem {...base} href="/c/1" menu={<IconButton label="Opciones" icon={MoreHorizontal} />} />)
    expect(screen.getByRole('button', { name: 'Opciones' })).toBeInTheDocument()
  })
  describe('rename mode', () => {
    const setup = () => {
      const onRename = vi.fn()
      const onRenameCancel = vi.fn()
      render(<ConversationItem {...base} renaming renameLabel="Renombrar conversación" onRename={onRename} onRenameCancel={onRenameCancel} />)
      return { onRename, onRenameCancel, input: screen.getByRole('textbox', { name: 'Renombrar conversación' }) }
    }
    it('shows a focused input with the current title and no link', () => {
      const { input } = setup()
      expect(input).toHaveValue(base.title)
      expect(input).toHaveFocus()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
    it('commits on Enter', async () => {
      const { input, onRename } = setup()
      await userEvent.clear(input)
      await userEvent.type(input, 'Nuevo nombre{Enter}')
      expect(onRename).toHaveBeenCalledExactlyOnceWith('Nuevo nombre')
    })
    it('cancels on Escape without committing', async () => {
      const { input, onRename, onRenameCancel } = setup()
      await userEvent.type(input, 'xx{Escape}')
      expect(onRenameCancel).toHaveBeenCalledOnce()
      expect(onRename).not.toHaveBeenCalled()
    })
    it('commits on blur', async () => {
      const { input, onRename } = setup()
      await userEvent.type(input, '!')
      await userEvent.tab()
      expect(onRename).toHaveBeenCalledExactlyOnceWith(`${base.title}!`)
    })
  })
})
