import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import { NO_STOCK_CONVERSATION_ID } from '../../services/mock/runs'

vi.mock('../chat/ChatPanel', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }))

const open = () => renderApp({ path: `/c/${NO_STOCK_CONVERSATION_ID}/productos/QF-0001`, withoutStock: true })
const main = () => within(screen.getByRole('main'))

describe('product detail of a file without stock', () => {
  it('shows reliability, the forecast chart and a weekly demand table', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Ácido cítrico anhidro' })).toBeInTheDocument()
    expect(await main().findByRole('region', { name: 'Confiabilidad' })).toBeInTheDocument()
    expect(main().getByRole('img', { name: /Ácido cítrico anhidro/ })).toBeInTheDocument()
    const table = main().getByRole('table', { name: /Demanda semanal/ })
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('has no purchase, stockout or scenario controls and no risk badge', async () => {
    open()
    await screen.findByRole('table', { name: /Demanda semanal/ })
    expect(main().queryByRole('region', { name: 'Compra sugerida' })).not.toBeInTheDocument()
    expect(main().queryByRole('region', { name: 'El stock se acaba el' })).not.toBeInTheDocument()
    expect(main().queryByRole('radio', { name: /compra/i })).not.toBeInTheDocument()
    expect(main().queryByText('Crítico')).not.toBeInTheDocument()
  })
})
