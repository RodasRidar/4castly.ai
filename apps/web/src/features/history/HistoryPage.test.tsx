import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../app/testing'
import { historyConfig } from './historyConfig'


const KARDEX = 'c5d30c23-398a-5d64-a690-c2086b0def35'
const open = (search = '', options: Parameters<typeof renderApp>[0] = {}) => renderApp({ path: `/historial${search}`, ...options })

const list = async () => screen.findByRole('list', { name: 'Conversaciones' })
const rows = async () => within(await list()).getAllByRole('listitem')

beforeEach(() => {
  historyConfig.debounceMs = 5
  historyConfig.pageSize = 20
})

describe('history page', () => {
  it('lists every conversation as a link with its file, stage and date, under one h1', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(await rows()).toHaveLength(14)
    const row = (await rows()).find((r) => within(r).queryByText('Kardex octubre 2026'))!
    expect(within(row).getByRole('link', { name: 'Kardex octubre 2026' })).toHaveAttribute('href', `/c/${KARDEX}`)
    expect(within(row).getByText('kardex_oct.xlsx')).toBeInTheDocument()
    expect(within(row).getByText('Lista')).toBeInTheDocument()
    expect(within(row).getByText(/^(hace .+|ahora|ayer|\d{1,2} \S+ \d{4})$/)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows what stage a conversation is in, in words', async () => {
    open()
    const failed = (await rows()).find((r) => within(r).queryByText('Pronóstico con error'))!
    expect(within(failed).getByText('Con error')).toBeInTheDocument()
    const working = (await rows()).find((r) => within(r).queryByText('Ventas enero a octubre'))!
    expect(within(working).getByText('Leyendo archivo')).toBeInTheDocument()
  })

  it('follows a row to its conversation', async () => {
    const { user, router } = open()
    await user.click(await screen.findByRole('link', { name: 'Kardex octubre 2026' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${KARDEX}`))
  })
})

describe('paging', () => {
  it('loads more with a button until the cursor runs out', async () => {
    historyConfig.pageSize = 5
    const app = open()
    await waitFor(async () => expect(await rows()).toHaveLength(5))
    await app.user.click(screen.getByRole('button', { name: 'Cargar más' }))
    await waitFor(async () => expect(await rows()).toHaveLength(10))
    await app.user.click(screen.getByRole('button', { name: 'Cargar más' }))
    await waitFor(async () => expect(await rows()).toHaveLength(14))
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })
})

describe('search', () => {
  it('filters as you type, ignoring accents, and keeps the query in the URL', async () => {
    const { user, router } = open()
    await user.type(await screen.findByRole('textbox', { name: 'Buscar conversaciones' }), 'PRONOSTICO')
    await waitFor(() => expect(router.state.location.search).toBe('?q=PRONOSTICO'))
    await waitFor(async () => expect(await rows()).toHaveLength(2))
    const titles = (await rows()).map((r) => r.textContent ?? '')
    expect(titles.some((text) => text.includes('Pronóstico con error'))).toBe(true)
    for (const text of titles) expect(text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()).toContain('pronostico')
  })

  it('starts from the query in the URL', async () => {
    open('?q=ventas')
    expect(await screen.findByRole('textbox', { name: 'Buscar conversaciones' })).toHaveValue('ventas')
    await waitFor(async () => expect((await rows()).length).toBeGreaterThan(0))
    for (const row of await rows()) expect(row.textContent?.toLowerCase()).toContain('ventas')
  })

  it('says so when nothing matches and clears the search from the empty state', async () => {
    const { user, router } = open('?q=zzzz')
    expect(await screen.findByText('No encontramos conversaciones')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await rows()).toHaveLength(14)
    expect(screen.getByRole('textbox', { name: 'Buscar conversaciones' })).toHaveValue('')
  })
})

describe('archived conversations', () => {
  it('hides archived ones until asked, then lets the user unarchive', async () => {
    const app = open()
    await app.services.conversations.update(KARDEX, { archived: true })
    app.router.navigate('/historial')
    await waitFor(async () => expect(await rows()).toHaveLength(13))

    await app.user.click(screen.getByRole('switch', { name: 'Mostrar archivadas' }))
    await waitFor(() => expect(app.router.state.location.search).toBe('?archivadas=1'))
    await waitFor(async () => expect(await rows()).toHaveLength(14))
    const row = (await rows()).find((r) => within(r).queryByText('Kardex octubre 2026'))!
    expect(within(row).getByText('Archivada')).toBeInTheDocument()

    await app.user.click(within(row).getByRole('button', { name: /Desarchivar/ }))
    await waitFor(async () => expect(within(await list()).queryByText('Archivada')).not.toBeInTheDocument())
    expect((await app.services.conversations.get(KARDEX)).archived).toBe(false)
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' })
    expect(await within(nav).findByRole('link', { name: /Kardex octubre 2026/ })).toBeInTheDocument()
  })
})

describe('delete with undo', () => {
  it('asks first, removes the row, and brings it back on Deshacer', async () => {
    const app = open()
    const row = (await rows()).find((r) => within(r).queryByText('Kardex octubre 2026'))!
    await app.user.click(within(row).getByRole('button', { name: /Eliminar/ }))
    const dialog = await screen.findByRole('dialog', { name: '¿Eliminar esta conversación?' })
    await app.user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Conversación eliminada')).toBeInTheDocument()
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'))
    await waitFor(async () => expect(await rows()).toHaveLength(13))
    await app.user.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(async () => expect(await rows()).toHaveLength(14))
    expect((await app.services.conversations.get(KARDEX)).id).toBe(KARDEX)
  })

  it('does nothing when the user cancels', async () => {
    const app = open()
    const row = (await rows()).find((r) => within(r).queryByText('Kardex octubre 2026'))!
    await app.user.click(within(row).getByRole('button', { name: /Eliminar/ }))
    await app.user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await rows()).toHaveLength(14)
    expect(screen.queryByText('Conversación eliminada')).not.toBeInTheDocument()
  })
})

describe('states', () => {
  it('shows a loading state while the first page loads', async () => {
    open('', { latencyMs: 60 })
    expect(await screen.findByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
    expect(await list()).toBeInTheDocument()
  })

  it('explains an empty account and points to the first forecast', async () => {
    open('', { emptyConversations: true })
    // The sidebar shows the same empty state, so look inside the page itself.
    const page = within(await screen.findByRole('main'))
    expect(await page.findByText('Aún no hay conversaciones')).toBeInTheDocument()
    expect(page.getByRole('link', { name: 'Nuevo pronóstico' })).toHaveAttribute('href', '/nuevo')
  })

  it('shows an error with a working retry', async () => {
    const { user, services } = open('', { failConversations: true })
    expect(await screen.findAllByText('No pudimos cargar tus conversaciones')).not.toHaveLength(0)
    services.failConversations = false
    await user.click(screen.getAllByRole('button', { name: 'Reintentar' }).at(-1)!)
    expect(await rows()).toHaveLength(14)
  })

  it('speaks English in English', async () => {
    open('', { language: 'en', preferences: { locale: 'en' } })
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search conversations' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Show archived' })).toBeInTheDocument()
    const english = within(await screen.findByRole('list', { name: 'Conversations' }))
    const row = english.getAllByRole('listitem').find((r) => within(r).queryByText('Pronóstico con error'))!
    expect(within(row).getByText('Failed')).toBeInTheDocument()
  })
})
