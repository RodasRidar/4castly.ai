import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

function Demo({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose?.() }} title="Eliminar conversación" description="No se puede deshacer." closeLabel="Cerrar">
        <button>Confirmar</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('is a named, described dialog that moves focus inside', async () => {
    render(<Demo />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dlg = await screen.findByRole('dialog', { name: 'Eliminar conversación' })
    expect(dlg).toHaveAccessibleDescription('No se puede deshacer.')
    expect(dlg.contains(document.activeElement)).toBe(true)
  })
  it('closes with Escape and returns focus to the trigger', async () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it('traps focus with Tab', async () => {
    render(<Demo />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dlg = await screen.findByRole('dialog')
    for (let i = 0; i < 4; i++) {
      await userEvent.tab()
      expect(dlg.contains(document.activeElement)).toBe(true)
    }
  })
  it('closes with the close button', async () => {
    render(<Demo />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
