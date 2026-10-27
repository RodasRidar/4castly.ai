import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import { NO_STOCK_CONVERSATION_ID } from '../../services/mock/runs'

vi.mock('../chat/ChatPanel', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }))

const open = (search = '', options: Parameters<typeof renderApp>[0] = {}) =>
  renderApp({ path: `/c/${NO_STOCK_CONVERSATION_ID}${search}`, withoutStock: true, ...options })

const table = async () => {
  const el = await screen.findByRole('table')
  await waitFor(() => expect(screen.queryByText('Cargando productos')).not.toBeInTheDocument())
  return el
}

describe('results of a file without stock', () => {
  it('explains that only demand and reliability are shown', async () => {
    open()
    expect(await screen.findByText('Tu archivo no incluye stock: mostramos demanda y fiabilidad, no riesgo ni compras')).toBeInTheDocument()
  })

  it('hides the risk and coverage KPIs but keeps reliability', async () => {
    open()
    const kpis = within(await screen.findByRole('group', { name: 'Indicadores del pronóstico' }))
    expect(await kpis.findByText('Confiabilidad')).toBeInTheDocument()
    expect(kpis.queryByText(/en riesgo/i)).not.toBeInTheDocument()
    expect(kpis.queryByText(/cobertura/i)).not.toBeInTheDocument()
  })

  it('has no risk filter, and keeps search and class', async () => {
    open()
    await table()
    expect(screen.queryByRole('combobox', { name: 'Riesgo' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Clase ABC' })).toBeInTheDocument()
  })

  it('shows only name, class and typical demand columns, none sortable by stock figures', async () => {
    open()
    const headers = within(await table()).getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers.join('|')).not.toMatch(/Stock|Cobertura|Riesgo|Compra|Pedir/)
    expect(headers.join('|')).toMatch(/Producto/)
  })

  it('does not send the risk filter even if the URL has one', async () => {
    const { services } = open('?riesgo=critical')
    const spy = vi.spyOn(services.runs, 'products')
    await table()
    expect(screen.queryByText('No pudimos cargar los resultados')).not.toBeInTheDocument()
    for (const call of spy.mock.calls) expect(call[1]?.risk ?? []).toEqual([])
  })
})
