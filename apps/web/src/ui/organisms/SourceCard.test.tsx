import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SourceCard } from './SourceCard'

describe('SourceCard', () => {
  it('upload: is a named region wrapping its children', async () => {
    const onClick = vi.fn()
    render(
      <SourceCard variant="upload" title="Subir un archivo" description="Excel exportado de tu sistema">
        <button onClick={onClick}>Elegir archivo</button>
      </SourceCard>,
    )
    expect(screen.getByRole('region', { name: 'Subir un archivo' })).toBeInTheDocument()
    expect(screen.getByText('Excel exportado de tu sistema')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir archivo' }))
    expect(onClick).toHaveBeenCalled()
  })
  it('soon: shows the badge, is disabled and exposes nothing interactive', async () => {
    render(
      <SourceCard variant="soon" title="Google Sheets" soonLabel="Próximamente">
        <button>No debe aparecer</button>
      </SourceCard>,
    )
    const card = screen.getByText('Google Sheets').closest('[data-variant="soon"]')
    expect(card).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Próximamente')).toHaveAttribute('data-tone', 'soon')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    await userEvent.tab()
    expect(document.body).toHaveFocus()
  })
})
