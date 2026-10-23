import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchField } from './SearchField'

function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial)
  return <SearchField aria-label="Buscar producto" placeholder="Buscar producto" clearLabel="Borrar búsqueda" value={v} onValueChange={setV} />
}

describe('SearchField', () => {
  it('is a labelled search box and reports typing', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar producto' }), 'cítrico')
    expect(screen.getByRole('textbox', { name: 'Buscar producto' })).toHaveValue('cítrico')
  })
  it('shows the clear button only with text, clears and refocuses', async () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
    await userEvent.type(screen.getByRole('textbox'), 'ac')
    await userEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
  })
  it('Escape clears', async () => {
    render(<Harness initial="abc" />)
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
