import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Drawer } from './Drawer'

function Demo({ side }: { side?: 'right' | 'left' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Preguntar</button>
      <Drawer open={open} onOpenChange={setOpen} title="Preguntar" closeLabel="Cerrar" side={side}>
        <input aria-label="Mensaje" />
      </Drawer>
    </>
  )
}

describe('Drawer', () => {
  it('is a named dialog with content, closes with Escape and restores focus', async () => {
    render(<Demo />)
    const trigger = screen.getByRole('button', { name: 'Preguntar' })
    await userEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Preguntar' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it.each(['right', 'left'] as const)('opens on the %s side', async (side) => {
    render(<Demo side={side} />)
    await userEvent.click(screen.getByRole('button', { name: 'Preguntar' }))
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-side', side)
  })
})
