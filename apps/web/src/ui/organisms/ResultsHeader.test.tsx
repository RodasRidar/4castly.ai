import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { ResultsHeader } from './ResultsHeader'

const breadcrumb = [
  { label: 'Proyecciones', href: '/proyecciones' },
  { label: 'Insumos químicos', href: '/c/1' },
  { label: 'Resultados' },
]

describe('ResultsHeader', () => {
  it('renders a breadcrumb nav with aria-current on the last item', () => {
    render(<ResultsHeader navLabel="Ruta de navegación" breadcrumb={breadcrumb} shareLabel="Compartir enlace" onShare={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Ruta de navegación' })
    expect(nav).toHaveTextContent('Proyecciones')
    expect(screen.getByRole('link', { name: 'Proyecciones' })).toHaveAttribute('href', '/proyecciones')
    expect(screen.getByText('Resultados')).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Resultados' })).toBeNull()
  })
  it('share button calls onShare', async () => {
    const onShare = vi.fn()
    render(<ResultsHeader navLabel="Ruta" breadcrumb={breadcrumb} shareLabel="Compartir enlace" onShare={onShare} />)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir enlace' }))
    expect(onShare).toHaveBeenCalledTimes(1)
  })
  it('renders the export menu slot', () => {
    render(<ResultsHeader navLabel="Ruta" breadcrumb={breadcrumb} shareLabel="Compartir" onShare={() => {}} exportMenu={<button type="button">Exportar</button>} />)
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
  })
  it('is a banner-less header, not a global top bar', () => {
    render(<ResultsHeader navLabel="Ruta" breadcrumb={breadcrumb} shareLabel="Compartir" onShare={() => {}} />)
    expect(screen.queryByRole('banner')).toBeNull()
  })
})
