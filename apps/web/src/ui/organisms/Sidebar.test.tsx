import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar, type SidebarProps } from './Sidebar'

const props = (over: Partial<SidebarProps> = {}): SidebarProps => ({
  label: 'Navegación principal',
  collapseLabel: 'Contraer barra lateral',
  expandLabel: 'Expandir barra lateral',
  newLabel: 'Nuevo forecast',
  onNew: vi.fn(),
  onToggleCollapsed: vi.fn(),
  historyLabel: 'Ver todo el historial',
  historyHref: '/historial',
  list: {
    label: 'Conversaciones',
    loadingLabel: 'Cargando',
    emptyTitle: 'Sin conversaciones',
    emptyBody: 'Sube un Kardex.',
    errorTitle: 'Error',
    errorBody: 'Intenta de nuevo.',
    retryLabel: 'Reintentar',
    pinnedLabel: 'Fijada',
    processingLabel: 'Calculando',
    failedLabel: 'Falló',
    renameLabel: 'Renombrar',
    groups: [{ id: 'today', title: 'Hoy', items: [{ id: '1', title: 'Ácido cítrico 25 kg', href: '/c/1' }] }],
  },
  footer: <button>Usuario</button>,
  ...over,
})

describe('Sidebar', () => {
  it('is a named nav landmark, 260 px wide, with logo, new button, list, history and footer', () => {
    render(<Sidebar {...props()} />)
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(nav).toHaveClass('w-[260px]')
    expect(within(nav).getByText('4Castly')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Nuevo forecast' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(nav).getByRole('link', { name: 'Ácido cítrico 25 kg' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Ver todo el historial' })).toHaveAttribute('href', '/historial')
    expect(within(nav).getByRole('button', { name: 'Usuario' })).toBeInTheDocument()
  })
  it('new button and collapse toggle fire their handlers', async () => {
    const p = props()
    render(<Sidebar {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo forecast' }))
    await userEvent.click(screen.getByRole('button', { name: 'Contraer barra lateral' }))
    expect(p.onNew).toHaveBeenCalledOnce()
    expect(p.onToggleCollapsed).toHaveBeenCalledOnce()
  })
  it('collapsed: icon rail without the list, still a nav with labelled controls', async () => {
    const p = props({ collapsed: true })
    render(<Sidebar {...p} />)
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(nav).not.toHaveClass('w-[260px]')
    expect(within(nav).queryByText('4Castly')).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Ácido cítrico 25 kg' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Ver todo el historial' })).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: 'Nuevo forecast' }))
    expect(p.onNew).toHaveBeenCalledOnce()
    await userEvent.click(within(nav).getByRole('button', { name: 'Expandir barra lateral' }))
    expect(p.onToggleCollapsed).toHaveBeenCalledOnce()
  })
  it('mobile: renders inside a drawer dialog', async () => {
    const onOpenChange = vi.fn()
    render(<Sidebar {...props({ mobile: { open: true, onOpenChange, title: 'Menú', closeLabel: 'Cerrar' } })} />)
    const dlg = screen.getByRole('dialog', { name: 'Menú' })
    expect(within(dlg).getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(within(dlg).queryByRole('button', { name: 'Contraer barra lateral' })).not.toBeInTheDocument()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cerrar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('mobile closed renders nothing', () => {
    render(<Sidebar {...props({ mobile: { open: false, onOpenChange: vi.fn(), title: 'Menú', closeLabel: 'Cerrar' } })} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
