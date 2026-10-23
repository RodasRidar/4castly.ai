import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SuggestionChips } from './SuggestionChips'

const items = ['¿Qué productos están en riesgo?', '¿Cuánto debo comprar?', '¿Cómo se calculó?', 'Cuarta sugerencia']

describe('SuggestionChips', () => {
  it('renders at most three chips', () => {
    render(<SuggestionChips label="Sugerencias" suggestions={items} onSelect={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Cuarta sugerencia' })).not.toBeInTheDocument()
  })
  it('reports the selected suggestion', async () => {
    const onSelect = vi.fn()
    render(<SuggestionChips label="Sugerencias" suggestions={items} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: '¿Cuánto debo comprar?' }))
    expect(onSelect).toHaveBeenCalledWith('¿Cuánto debo comprar?')
  })
  it('is a labelled group', () => {
    render(<SuggestionChips label="Sugerencias" suggestions={items} onSelect={() => {}} />)
    expect(screen.getByRole('group', { name: 'Sugerencias' })).toBeInTheDocument()
  })
  it('disables every chip while locked', async () => {
    const onSelect = vi.fn()
    render(<SuggestionChips label="Sugerencias" suggestions={items} locked onSelect={onSelect} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    await userEvent.click(screen.getAllByRole('button')[0]!)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
