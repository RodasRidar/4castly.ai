import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderApp } from '../app/testing'

const setOnline = (value: boolean) => Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })

afterEach(() => setOnline(true))

describe('offline banner', () => {
  it('is hidden while the browser is online', async () => {
    renderApp({ path: '/nuevo' })
    await screen.findByRole('main')
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
  })

  it('appears when the connection drops and goes away when it returns', async () => {
    renderApp({ path: '/nuevo' })
    await screen.findByRole('main')
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    const banner = await screen.findByRole('status', { name: 'Sin conexión. Reintentaremos cuando vuelva.' })
    expect(banner).toHaveTextContent('Sin conexión. Reintentaremos cuando vuelva.')
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument()
  })

  it('shows at once when the app starts offline, in English too', async () => {
    setOnline(false)
    renderApp({ path: '/nuevo', language: 'en' })
    expect(await screen.findByText('Offline. We will retry when you are back.')).toBeInTheDocument()
  })
})
