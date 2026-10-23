import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../app/testing'

const open = (options: Parameters<typeof renderApp>[0] = {}) => renderApp({ path: '/configuracion/perfil', ...options })

async function form() {
  return screen.findByRole('form', { name: 'Perfil' })
}

describe('profile (settings)', () => {
  it('shows the user with email and company read-only', async () => {
    open()
    const f = await form()
    expect(within(f).getByLabelText('Nombre')).toHaveValue('Ana Torres')
    expect(within(f).getByLabelText('Cargo')).toHaveValue('Jefa de compras')
    expect(within(f).getByLabelText('Correo')).toHaveAttribute('readonly')
    expect(within(f).getByLabelText('Empresa')).toHaveValue('Droguería Demo S.A.C.')
  })

  it('is pristine until something changes, then offers Descartar and Guardar', async () => {
    const { user } = open()
    const f = await form()
    expect(within(f).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    await user.type(within(f).getByLabelText('Cargo'), ' senior')
    expect(within(f).getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(within(f).getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
  })

  it('returns to pristine when the edit is undone by hand', async () => {
    const { user } = open()
    const f = await form()
    const role = within(f).getByLabelText('Cargo')
    await user.type(role, 'x')
    await user.type(role, '{Backspace}')
    expect(within(f).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('discards edits', async () => {
    const { user } = open()
    const f = await form()
    await user.type(within(f).getByLabelText('Nombre'), ' María')
    await user.click(within(f).getByRole('button', { name: 'Descartar' }))
    expect(within(f).getByLabelText('Nombre')).toHaveValue('Ana Torres')
    expect(within(f).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('saves, confirms with a toast and updates the name shown in the app', async () => {
    const { user, services } = open()
    const f = await form()
    const name = within(f).getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Ana Torres Díaz')
    await user.click(within(f).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findAllByText('Cambios guardados')).not.toHaveLength(0)
    expect((await services.profile.getMe()).full_name).toBe('Ana Torres Díaz')
    expect(within(f).queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
  })

  it('does not send an empty name and says why', async () => {
    const { user, services } = open()
    const f = await form()
    await user.clear(within(f).getByLabelText('Nombre'))
    await user.click(within(f).getByRole('button', { name: 'Guardar' }))
    expect(await within(f).findByText('Escribe tu nombre')).toBeInTheDocument()
    expect((await services.profile.getMe()).full_name).toBe('Ana Torres')
  })

  it('shows the server field error next to the field', async () => {
    const { user } = open()
    const f = await form()
    const name = within(f).getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'A')
    await user.click(within(f).getByRole('button', { name: 'Guardar' }))
    expect(await within(f).findByText('Usa al menos 2 caracteres')).toBeInTheDocument()
    expect(within(f).getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('keeps the edits and reports when saving fails', async () => {
    const { user, services } = open()
    services.failUpdateMe = true
    const f = await form()
    await user.type(within(f).getByLabelText('Cargo'), ' senior')
    await user.click(within(f).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No pudimos guardar tus cambios')).toBeInTheDocument()
    expect(within(f).getByLabelText('Cargo')).toHaveValue('Jefa de compras senior')
  })

  it('shows an error state with retry when the account cannot be loaded', async () => {
    const { user, services } = renderApp({ path: '/configuracion/perfil', failMe: true })
    expect(await screen.findByText('No pudimos cargar tu cuenta')).toBeInTheDocument()
    services.failMe = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await form()).toBeInTheDocument()
  })
})

describe('leaving with unsaved changes', () => {
  it('asks before following a link and lets the user keep editing', async () => {
    const { user, router } = open()
    const f = await form()
    await user.type(within(f).getByLabelText('Cargo'), ' senior')
    await user.click(screen.getByRole('link', { name: 'Preferencias' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir sin guardar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Seguir editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/configuracion/perfil')
    expect(within(f).getByLabelText('Cargo')).toHaveValue('Jefa de compras senior')
  })

  it('leaves and drops the edits when the user confirms', async () => {
    const { user, router } = open()
    const f = await form()
    await user.type(within(f).getByLabelText('Cargo'), ' senior')
    await user.click(screen.getByRole('link', { name: 'Volver a la aplicación' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Salir sin guardar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/nuevo'))
  })

  it('does not ask when nothing changed', async () => {
    const { user, router } = open()
    await form()
    await user.click(screen.getByRole('link', { name: 'Preferencias' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/preferencias'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not ask after a successful save', async () => {
    const { user, router } = open()
    const f = await form()
    await user.type(within(f).getByLabelText('Cargo'), ' senior')
    await user.click(within(f).getByRole('button', { name: 'Guardar' }))
    await screen.findAllByText('Cambios guardados')
    await user.click(screen.getByRole('link', { name: 'Preferencias' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracion/preferencias'))
  })

  it('warns the browser before closing the tab while dirty, and only then', async () => {
    const { user } = open()
    const f = await form()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    await user.type(within(f).getByLabelText('Cargo'), 'x')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })
})

describe('profile in English', () => {
  it('uses the English copy', async () => {
    renderApp({ path: '/configuracion/perfil', language: 'en', preferences: { locale: 'en' } })
    const f = await screen.findByRole('form', { name: 'Profile' })
    expect(within(f).getByLabelText('Name')).toHaveValue('Ana Torres')
  })
})
