import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('is an alert with title, body and support reference', () => {
    render(<ErrorState title="No pudimos calcular" body="Inténtalo de nuevo." supportReference="Referencia: 7F3A-92" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('No pudimos calcular')
    expect(alert).toHaveTextContent('Inténtalo de nuevo.')
    expect(alert).toHaveTextContent('Referencia: 7F3A-92')
  })
  it('renders primary and secondary action slots', () => {
    render(
      <ErrorState
        title="t"
        body="b"
        primaryAction={<button type="button">Reintentar</button>}
        secondaryAction={<button type="button">Contactar soporte</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contactar soporte' })).toBeInTheDocument()
  })
  it('support reference and actions are optional', () => {
    render(<ErrorState title="t" body="b" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
