import { render, screen } from '@testing-library/react'
import { MessageSquare } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title and body', () => {
    render(<EmptyState icon={MessageSquare} title="Aún no hay conversaciones" body="Sube un archivo para empezar." />)
    expect(screen.getByRole('heading', { name: 'Aún no hay conversaciones' })).toBeInTheDocument()
    expect(screen.getByText('Sube un archivo para empezar.')).toBeInTheDocument()
  })
  it('renders the action slot when given', () => {
    render(<EmptyState icon={MessageSquare} title="t" body="b" action={<button type="button">Nuevo forecast</button>} />)
    expect(screen.getByRole('button', { name: 'Nuevo forecast' })).toBeInTheDocument()
  })
  it('works without an action', () => {
    render(<EmptyState icon={MessageSquare} title="t" body="b" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
