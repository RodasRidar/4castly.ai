import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from './testing'

describe('theme and language wiring', () => {
  it('applies the stored theme preference once preferences load', async () => {
    const { themeStore } = renderApp({ path: '/nuevo', preferences: { theme: 'dark' } })
    await waitFor(() => expect(themeStore.getPreference()).toBe('dark'))
  })

  it('applies the stored language to the UI and the document', async () => {
    const { root } = renderApp({ path: '/nuevo', preferences: { locale: 'en' } })
    expect(await screen.findByRole('button', { name: 'New forecast' })).toBeInTheDocument()
    expect(root.lang).toBe('en')
  })

  it('switches language from the user menu, persists it and updates the document', async () => {
    const { user, services, root } = renderApp({ path: '/nuevo' })
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.selectOptions(await screen.findByLabelText('Idioma'), 'en')
    expect(await screen.findByRole('button', { name: 'New forecast' })).toBeInTheDocument()
    expect(root.lang).toBe('en')
    expect((await services.profile.getPreferences()).locale).toBe('en')
  })

  it('changes the theme from the user menu and saves it to the profile', async () => {
    const { user, services, themeStore } = renderApp({ path: '/nuevo' })
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(await screen.findByRole('radio', { name: 'Oscuro' }))
    expect(themeStore.getPreference()).toBe('dark')
    await waitFor(async () => expect((await services.profile.getPreferences()).theme).toBe('dark'))
  })

  it('keeps the settings form and the store in sync', async () => {
    const { user, themeStore, services } = renderApp({ path: '/configuracion/preferencias' })
    const form = await screen.findByRole('group', { name: 'Preferencias de la cuenta' })
    await user.click(within(form).getByRole('radio', { name: 'Claro' }))
    expect(themeStore.getPreference()).toBe('light')
    await waitFor(async () => expect((await services.profile.getPreferences()).theme).toBe('light'))
  })

  it('rolls back and reports when saving a preference fails', async () => {
    const { user, themeStore } = renderApp({ path: '/nuevo', failPatch: true })
    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }))
    await user.click(await screen.findByRole('radio', { name: 'Oscuro' }))
    await waitFor(() => expect(themeStore.getPreference()).toBe('system'))
    expect(await screen.findByText(/No pudimos guardar el cambio/)).toBeInTheDocument()
  })
})
