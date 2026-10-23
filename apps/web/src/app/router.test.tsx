import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setViewport } from '../test/matchMedia'
import { renderApp } from './testing'

describe('guards', () => {
  it('redirects an anonymous visitor to /login and remembers where they were going', async () => {
    const { router } = renderApp({ path: '/historial', signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?next=%2Fhistorial')
  })

  it('sends a signed-in user away from /login', async () => {
    const { router } = renderApp({ path: '/login' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/nuevo'))
  })

  it('honours a same-origin next parameter', async () => {
    const { router } = renderApp({ path: '/login?next=%2Fhistorial' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/historial'))
  })

  it.each(['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)'])(
    'ignores the unsafe next parameter %s',
    async (next) => {
      const { router } = renderApp({ path: `/login?next=${encodeURIComponent(next)}` })
      await waitFor(() => expect(router.state.location.pathname).toBe('/nuevo'))
    },
  )

  it('protects settings too', async () => {
    const { router } = renderApp({ path: '/configuracion/preferencias', signedIn: false })
    await screen.findByRole('heading', { name: 'Inicia sesión' })
    expect(router.state.location.search).toBe('?next=%2Fconfiguracion%2Fpreferencias')
  })

  it('signs out from the user menu and lands on /login', async () => {
    const { router, user } = renderApp({ path: '/nuevo' })
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})

describe('routes', () => {
  it('redirects / to /nuevo and /configuracion to the profile', async () => {
    const a = renderApp({ path: '/' })
    await waitFor(() => expect(a.router.state.location.pathname).toBe('/nuevo'))
    a.unmount()
    const b = renderApp({ path: '/configuracion' })
    await waitFor(() => expect(b.router.state.location.pathname).toBe('/configuracion/perfil'))
  })

  it('shows a not-found page for unknown addresses', async () => {
    renderApp({ path: '/no-existe' })
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('renders the product detail route', async () => {
    renderApp({ path: '/c/c5d30c23-398a-5d64-a690-c2086b0def35/productos/PRQ-010130' })
    expect(await screen.findByRole('heading', { name: 'Detalle del producto' })).toBeInTheDocument()
  })

  it('marks the page as the main landmark', async () => {
    renderApp({ path: '/nuevo' })
    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})

describe('AppLayout', () => {
  it('keeps the sidebar mounted while moving between conversations', async () => {
    const { router, user } = renderApp({ path: '/c/c5d30c23-398a-5d64-a690-c2086b0def35' })
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' })
    await user.click(await within(nav).findByRole('link', { name: /Ventas tercer trimestre/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/f9f0fc05-4411-53c2-8a70-6dfb1d902c1b'))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBe(nav)
    expect(within(nav).getByRole('link', { name: /Ventas tercer trimestre/ })).toHaveAttribute('aria-current', 'page')
  })

  it('does not reload the document when following internal links', async () => {
    const { user } = renderApp({ path: '/nuevo' })
    const before = document.body
    await user.click(await screen.findByRole('link', { name: 'Historial' }))
    expect(await screen.findByRole('heading', { name: 'Historial', level: 1 })).toBeInTheDocument()
    expect(document.body).toBe(before)
  })

  it('collapses and expands the sidebar', async () => {
    const { user } = renderApp({ path: '/nuevo' })
    await user.click(await screen.findByRole('button', { name: 'Contraer barra lateral' }))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toHaveAttribute('data-collapsed')
    await user.click(screen.getByRole('button', { name: 'Expandir barra lateral' }))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).not.toHaveAttribute('data-collapsed')
  })

  it('opens the sidebar as a drawer on a narrow viewport', async () => {
    setViewport({ width: 390 })
    const { user } = renderApp({ path: '/nuevo' })
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Abrir menú de navegación' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  it('shows an empty list state when there are no conversations', async () => {
    renderApp({ path: '/nuevo', emptyConversations: true })
    expect(await screen.findByText('Aún no hay conversaciones')).toBeInTheDocument()
  })

  it('shows pinned, processing and failed conversations', async () => {
    renderApp({ path: '/nuevo' })
    expect(await screen.findByText('Fijados')).toBeInTheDocument()
    expect(screen.getByText('Kardex octubre 2026')).toBeInTheDocument()
  })

  it('shows the conversation error state with retry', async () => {
    const { services, user } = renderApp({ path: '/nuevo', failConversations: true })
    expect(await screen.findByText('No pudimos cargar tus conversaciones')).toBeInTheDocument()
    services.failConversations = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ventas por confirmar')).toBeInTheDocument()
  })
})

describe('SettingsLayout', () => {
  it('has its own navigation and no conversation sidebar', async () => {
    renderApp({ path: '/configuracion/preferencias' })
    expect(await screen.findByRole('navigation', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).not.toBeInTheDocument()
  })

  it('goes back to the app', async () => {
    const { router, user } = renderApp({ path: '/configuracion/perfil' })
    await user.click(await screen.findByRole('link', { name: 'Volver a la aplicación' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/nuevo'))
  })
})
