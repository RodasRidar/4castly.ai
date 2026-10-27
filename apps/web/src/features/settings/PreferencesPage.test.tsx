import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../app/testing'

describe('preferences page: assistant style', () => {
  it('shows the saved style and saves a change through the shared mutation', async () => {
    const { user, services } = renderApp({ path: '/configuracion/preferencias' })
    const form = await screen.findByRole('group', { name: 'Preferencias de la cuenta' })
    expect(within(form).getByRole('radio', { name: 'Breve' })).toBeChecked()
    await user.click(within(form).getByRole('radio', { name: 'Detallado' }))
    await waitFor(async () => expect((await services.profile.getPreferences()).assistant_style).toBe('detailed'))
  })

  it('rolls the style back and tells the user when saving fails', async () => {
    const { user, services } = renderApp({ path: '/configuracion/preferencias', failPatch: true })
    const form = await screen.findByRole('group', { name: 'Preferencias de la cuenta' })
    await user.click(within(form).getByRole('radio', { name: 'Detallado' }))
    expect(await screen.findByText(/No pudimos guardar el cambio/)).toBeInTheDocument()
    await waitFor(() => expect(within(form).getByRole('radio', { name: 'Breve' })).toBeChecked())
    expect((await services.profile.getPreferences()).assistant_style).toBe('brief')
  })

  it('uses English labels in English', async () => {
    renderApp({ path: '/configuracion/preferencias', language: 'en', preferences: { locale: 'en' } })
    const form = await screen.findByRole('group', { name: 'Account preferences' })
    expect(within(form).getByRole('radiogroup', { name: 'Assistant style' })).toBeInTheDocument()
    expect(within(form).getByRole('radio', { name: 'Brief' })).toBeChecked()
  })
})
