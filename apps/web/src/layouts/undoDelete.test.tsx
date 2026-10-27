import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../app/testing'
import { ApiFailure } from '../services/types'

const KARDEX = 'c5d30c23-398a-5d64-a690-c2086b0def35'

async function deleteFromSidebar(app: ReturnType<typeof renderApp>, title: string) {
  const nav = await screen.findByRole('navigation', { name: 'Navegación principal' })
  const row = (await within(nav).findByText(title)).closest('li') as HTMLElement
  await app.user.click(within(row).getByRole('button', { name: 'Opciones de la conversación' }))
  await app.user.click(await screen.findByRole('menuitem', { name: 'Eliminar' }))
  const dialog = await screen.findByRole('dialog', { name: '¿Eliminar esta conversación?' })
  await app.user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
  // Radix keeps `pointer-events: none` on the body until the dialog has finished closing.
  await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'))
}

describe('undo after deleting from the sidebar', () => {
  it('removes the row, offers Deshacer, and brings the conversation back', async () => {
    const app = renderApp({ path: '/nuevo' })
    await deleteFromSidebar(app, 'Kardex octubre 2026')
    expect(await screen.findByText('Conversación eliminada')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: /Kardex octubre 2026/ })).not.toBeInTheDocument())
    await expect(app.services.conversations.get(KARDEX)).rejects.toMatchObject({ problem: { code: 'not_found' } })

    await app.user.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(await screen.findByRole('link', { name: /Kardex octubre 2026/ })).toBeInTheDocument()
    expect((await app.services.conversations.get(KARDEX)).id).toBe(KARDEX)
  })

  it('still leaves the page of the deleted conversation, and undo works from there', async () => {
    const app = renderApp({ path: `/c/${KARDEX}` })
    await deleteFromSidebar(app, 'Kardex octubre 2026')
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/nuevo'))
    await app.user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(await screen.findByRole('link', { name: /Kardex octubre 2026/ })).toBeInTheDocument()
  })

  it('uses English copy in English', async () => {
    const app = renderApp({ path: '/nuevo', language: 'en', preferences: { locale: 'en' } })
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' })
    const row = (await within(nav).findByText('Kardex octubre 2026')).closest('li') as HTMLElement
    await app.user.click(within(row).getByRole('button', { name: 'Conversation options' }))
    await app.user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this conversation?' })
    await app.user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Conversation deleted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
})

describe('delete and restore failures', () => {
  it('explains a failed delete in plain words with the support reference', async () => {
    const app = renderApp({ path: '/nuevo' })
    app.services.conversations.remove = async () => {
      throw new ApiFailure({ type: 'about:blank', title: 't', status: 500, code: 'internal_error', message_key: 'errors.internal', ref: 'K7Q2WX' })
    }
    await deleteFromSidebar(app, 'Kardex octubre 2026')
    expect(await screen.findByText(/Algo salió mal de nuestro lado.*Referencia: K7Q2WX/)).toBeInTheDocument()
    expect(screen.queryByText('Conversación eliminada')).not.toBeInTheDocument()
  })
})
