import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../i18n'
import { I18nextProvider } from 'react-i18next'
import { PanelBoundary } from './ErrorBoundary'

let broken = true
function Fragile() {
  if (broken) throw new Error('render failed')
  return <p>Panel content</p>
}

const renderBoundary = () =>
  render(
    <I18nextProvider i18n={createI18n('es')}>
      <p>Rest of the screen</p>
      <PanelBoundary>
        <Fragile />
      </PanelBoundary>
    </I18nextProvider>,
  )

beforeEach(() => {
  broken = true
  // React logs the caught error on purpose; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('PanelBoundary', () => {
  it('shows a panel-level error and leaves the rest of the screen alone', () => {
    renderBoundary()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos mostrar este panel')
    expect(screen.getByText('Rest of the screen')).toBeInTheDocument()
    expect(screen.queryByText('Panel content')).not.toBeInTheDocument()
  })

  it('tries again on Reintentar and shows the content when the cause is gone', async () => {
    renderBoundary()
    broken = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('Panel content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stays in the error state if retrying fails again', async () => {
    renderBoundary()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders healthy children untouched', () => {
    broken = false
    renderBoundary()
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })
})
