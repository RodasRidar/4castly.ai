import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import { MOCK_OTP_CODE } from '../../services/mock'
import { ApiFailure } from '../../services/types'

const EMAIL_LABEL = 'Correo electrónico'
const SEND = 'Enviarme un enlace de acceso'

async function submitEmail(user: ReturnType<typeof renderApp>['user'], email = 'ana.torres@example.com') {
  await user.type(await screen.findByLabelText(EMAIL_LABEL), email)
  await user.click(screen.getByRole('button', { name: SEND }))
}

afterEach(() => vi.useRealTimers())

describe('LoginPage', () => {
  it('idle: shows the email field and a single primary action', async () => {
    renderApp({ path: '/login', signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveValue('')
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')).toHaveLength(1)
  })

  it('shows the legal footer exactly once', async () => {
    renderApp({ path: '/login', signedIn: false })
    await screen.findByRole('heading', { name: 'Inicia sesión' })
    expect(screen.getAllByRole('link', { name: 'Términos' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Privacidad' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Soporte' })).toHaveLength(1)
    expect(screen.getAllByText(/© 2026 4Castly/)).toHaveLength(1)
  })

  it('invalid_email: rejects a malformed address without calling the service', async () => {
    const { services, user } = renderApp({ path: '/login', signedIn: false })
    const spy = vi.spyOn(services.auth, 'requestCode')
    await submitEmail(user, 'no-es-un-correo')
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un correo válido')
    expect(screen.getByLabelText(EMAIL_LABEL)).toHaveAttribute('aria-invalid', 'true')
    expect(spy).not.toHaveBeenCalled()
  })

  it('sending: disables the action while the request is in flight', async () => {
    const { services, user } = renderApp({ path: '/login', signedIn: false })
    vi.spyOn(services.auth, 'requestCode').mockReturnValue(new Promise(() => {}))
    await submitEmail(user)
    expect(screen.getByRole('button', { name: SEND })).toBeDisabled()
    expect(screen.getByRole('button', { name: SEND })).toHaveAttribute('aria-busy', 'true')
  })

  it('code_sent: shows the neutral copy and the six code cells', async () => {
    const { user } = renderApp({ path: '/login', signedIn: false })
    await submitEmail(user)
    expect(await screen.findByText(/Si tu correo está habilitado/)).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Código de 6 dígitos' })
    expect(within(group).getAllByRole('textbox')).toHaveLength(6)
    expect(screen.getByText('ana.torres@example.com')).toBeInTheDocument()
  })

  it('never reveals whether an email is enabled: any well-formed address gets the same copy', async () => {
    const a = renderApp({ path: '/login', signedIn: false })
    await submitEmail(a.user, 'ana.torres@example.com')
    const first = (await screen.findByText(/Si tu correo está habilitado/)).textContent
    a.unmount()
    const b = renderApp({ path: '/login', signedIn: false })
    await submitEmail(b.user, 'desconocido@otra-empresa.example')
    expect((await screen.findByText(/Si tu correo está habilitado/)).textContent).toBe(first)
  })

  it('does not reveal the outcome when the service rejects an unknown address', async () => {
    const { services, user } = renderApp({ path: '/login', signedIn: false })
    vi.spyOn(services.auth, 'requestCode').mockRejectedValue(
      new ApiFailure({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'not_enabled', message_key: 'errors.x', ref: 'ABC123' }),
    )
    await submitEmail(user)
    expect(await screen.findByText(/Si tu correo está habilitado/)).toBeInTheDocument()
  })

  it('rate limited: shows an inline notice and stays on the email step', async () => {
    const { services, user } = renderApp({ path: '/login', signedIn: false })
    vi.spyOn(services.auth, 'requestCode').mockRejectedValue(
      new ApiFailure({ type: 'about:blank', title: 'Too Many Requests', status: 429, code: 'rate_limited', message_key: 'errors.rateLimited', ref: 'K7Q2WX' }),
    )
    await submitEmail(user)
    expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Código de 6 dígitos' })).not.toBeInTheDocument()
  })

  it('a correct code signs in and goes to the requested page', async () => {
    const { user, router } = renderApp({ path: '/login?next=%2Fhistorial', signedIn: false })
    await submitEmail(user)
    const cells = within(await screen.findByRole('group', { name: 'Código de 6 dígitos' })).getAllByRole('textbox')
    await user.click(cells[0])
    await user.keyboard(MOCK_OTP_CODE)
    await waitFor(() => expect(router.state.location.pathname).toBe('/historial'))
  })

  it('code_invalid: a wrong code shows an alert and keeps the cells', async () => {
    const { user } = renderApp({ path: '/login', signedIn: false })
    await submitEmail(user)
    const cells = within(await screen.findByRole('group', { name: 'Código de 6 dígitos' })).getAllByRole('textbox')
    await user.click(cells[0])
    await user.keyboard('000000')
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto o venció')
    expect(cells[0]).toHaveAttribute('aria-invalid', 'true')
  })

  it('"Usar otro correo" returns to the email step', async () => {
    const { user } = renderApp({ path: '/login', signedIn: false })
    await submitEmail(user)
    await user.click(await screen.findByRole('button', { name: 'Usar otro correo' }))
    expect(screen.getByLabelText(EMAIL_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Código de 6 dígitos' })).not.toBeInTheDocument()
  })

  it('resend: counts down 30 s, then lets the user ask for a new code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user, services } = renderApp({ path: '/login', signedIn: false })
    const spy = vi.spyOn(services.auth, 'requestCode')
    await submitEmail(user)
    await screen.findByText(/Si tu correo está habilitado/)
    expect(screen.getByText(/Reenviar código en 30 s/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar código' })).not.toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    await user.click(await screen.findByRole('button', { name: 'Reenviar código' }))
    expect(spy).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/Reenviar código en 30 s/)).toBeInTheDocument()
  })

  it('submits the email with the Enter key', async () => {
    const { user } = renderApp({ path: '/login', signedIn: false })
    await user.type(await screen.findByLabelText(EMAIL_LABEL), 'ana.torres@example.com{Enter}')
    expect(await screen.findByText(/Si tu correo está habilitado/)).toBeInTheDocument()
  })

  it('speaks English when the language is en', async () => {
    renderApp({ path: '/login', signedIn: false, language: 'en' })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument()
  })
})

describe('AuthCallbackPage', () => {
  it('explains an invalid link and offers a way back to sign in', async () => {
    renderApp({ path: '/auth/callback', signedIn: false })
    expect(await screen.findByRole('heading', { name: 'No pudimos validar tu enlace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute('href', '/login')
  })

  it('redirects a signed-in visitor to the app', async () => {
    const { router } = renderApp({ path: '/auth/callback' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/nuevo'))
  })

  it('says it is checking the link before it decides', async () => {
    renderApp({ path: '/auth/callback', signedIn: false, latencyMs: 40 })
    expect(await screen.findByRole('status', { name: 'Validando tu acceso…' })).toBeInTheDocument()
  })

  it('picks up a session that appeared after the link was processed and goes where the user was headed', async () => {
    const { services, router } = renderApp({ path: '/auth/callback?next=%2Fhistorial', signedIn: false, latencyMs: 30 })
    // The guard's first check is already in flight and answers "no session"; the page's own check finds one.
    services.auth.hasSession = async () => true
    await waitFor(() => expect(router.state.location.pathname).toBe('/historial'))
  })

  it('shows the invalid-link state when the check itself fails', async () => {
    const { services } = renderApp({ path: '/auth/callback', signedIn: false, latencyMs: 30 })
    services.auth.hasSession = async () => {
      throw new Error('boom')
    }
    expect(await screen.findByRole('heading', { name: 'No pudimos validar tu enlace' })).toBeInTheDocument()
  })
})
