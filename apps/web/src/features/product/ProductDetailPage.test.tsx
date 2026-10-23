import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import details from '../../services/mock/fixtures/run-product-details.json'
import type { ProductDetail } from '../../services/types'
import { simulationConfig } from './useProductData'

vi.mock('../chat/ChatPanel', () => ({
  ChatPanel: (props: { conversationId: string; productCode?: string; suggestions?: string[] }) => (
    <div data-testid="chat-panel" data-conversation={props.conversationId} data-product={props.productCode}>
      {(props.suggestions ?? []).map((s) => (
        <span key={s}>{s}</span>
      ))}
    </div>
  ),
}))

const READY = 'c5d30c23-398a-5d64-a690-c2086b0def35'
const CALCULATING = '1f17e33b-9af2-505c-839c-3635dd414f56'
const RUN = 'b3984a50-ec9f-5ff8-acdc-763d348729cf'
const fixtures = details as unknown as Record<string, ProductDetail>

const product = (code: string, search = '', options: Parameters<typeof renderApp>[0] = {}) =>
  renderApp({ path: `/c/${READY}/productos/${code}${search}`, ...options })
const title = (name: string) => screen.findByRole('heading', { level: 1, name })
const main = () => within(screen.getByRole('main'))

beforeEach(() => {
  simulationConfig.debounceMs = 5
})
afterEach(() => {
  simulationConfig.debounceMs = 300
  vi.restoreAllMocks()
})

describe('header', () => {
  it('shows the product, its code, class, risk and the data date', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(main().getByText('Código QF-0001')).toBeInTheDocument()
    expect(main().getByText('Clase A')).toBeInTheDocument()
    expect(main().getByText('Crítico')).toBeInTheDocument()
    expect(main().getByText(/Datos hasta el 18 oct 2026/)).toBeInTheDocument()
  })

  it('links back to the conversation when it was opened directly', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(main().getByRole('link', { name: 'Volver a los resultados' })).toHaveAttribute('href', `/c/${READY}`)
  })

  it('goes back to the exact results view (filters included) when it came from there', async () => {
    const { router, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    await act(() => router.navigate(`/c/${READY}?riesgo=critical&pagina=2`))
    await act(() => router.navigate(`/c/${READY}/productos/QF-0002`))
    await title('Glicerina vegetal USP')
    await user.click(main().getByRole('link', { name: 'Volver a los resultados' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${READY}`))
    expect(router.state.location.search).toBe('?riesgo=critical&pagina=2')
  })

  it('is the only page with a single primary action', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    const primary = main()
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-variant') === 'primary')
    expect(primary.map((b) => b.textContent)).toEqual(['Exportar producto'])
  })

  it('speaks English when the language is English', async () => {
    product('QF-0001', '', { language: 'en', preferences: { locale: 'en' } })
    await title('Ácido cítrico anhidro')
    expect(main().getByRole('link', { name: 'Back to results' })).toBeInTheDocument()
    expect(main().getByText(/Data until/)).toBeInTheDocument()
  })
})

describe('stockout card', () => {
  it('shows the date the stock runs out', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    const card = within(await screen.findByRole('region', { name: 'El stock se acaba el' }))
    expect(card.getByText('26 oct 2026')).toBeInTheDocument()
  })

  it('says so when there is no stockout in the calculated period', async () => {
    product('QF-0007')
    await title('Estearato de magnesio')
    const card = within(await screen.findByRole('region', { name: 'El stock se acaba el' }))
    expect(card.getByText('No se agota')).toBeInTheDocument()
  })
})

describe('purchase card', () => {
  it('shows quantity, range, buy-before date and the action note', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    const card = within(await screen.findByRole('region', { name: 'Compra sugerida' }))
    expect(card.getByText('23 oct 2026')).toBeInTheDocument()
    expect(card.getByText(/13\.226,3/)).toBeInTheDocument()
    expect(main().getByText(/de 11\.894,7 a 13\.226,3 kg/)).toBeInTheDocument()
    expect(main().getByText(/Haz el pedido hoy/)).toBeInTheDocument()
    expect(main().getByText(/unas 2 semanas sin stock/)).toBeInTheDocument()
  })

  it('uses the order-by-date note when the purchase can wait', async () => {
    product('QF-0002')
    await title('Glicerina vegetal USP')
    await screen.findByRole('region', { name: 'Compra sugerida' })
    expect(main().getByText(/antes de esa fecha/)).toBeInTheDocument()
    expect(main().queryByText(/Haz el pedido hoy/)).not.toBeInTheDocument()
  })

  it('says no purchase is needed when nothing runs out', async () => {
    product('QF-0007')
    await title('Estearato de magnesio')
    const card = within(await screen.findByRole('region', { name: 'Compra sugerida' }))
    expect(card.getByText('No necesitas comprar dentro del periodo calculado.')).toBeInTheDocument()
  })

  it('warns when the suggested quantity was capped', async () => {
    const { services } = product('QF-0001')
    const real = services.runs.product.bind(services.runs)
    vi.spyOn(services.runs, 'product').mockImplementation(async (runId, code) => {
      const detail = await real(runId, code)
      return { ...detail, purchase: { ...detail.purchase, truncated: true } }
    })
    await title('Ácido cítrico anhidro')
    expect(await screen.findByText(/La cantidad se limitó al periodo calculado/)).toBeInTheDocument()
  })

  it('starts from the product lead time and target coverage', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(await screen.findByRole('spinbutton', { name: 'Tiempo de reposición' })).toHaveAttribute('aria-valuenow', '21')
    expect(screen.getByRole('spinbutton', { name: 'Cobertura objetivo' })).toHaveAttribute('aria-valuenow', '4')
  })
})

describe('what-if and overrides', () => {
  it('re-simulates with the edited lead time (keyboard) and offers to save it', async () => {
    const { services, user } = product('QF-0001')
    const simulate = vi.spyOn(services.runs, 'simulate')
    await title('Ácido cítrico anhidro')
    const stepper = await screen.findByRole('spinbutton', { name: 'Tiempo de reposición' })
    expect(screen.queryByRole('button', { name: 'Guardar tiempo de reposición' })).not.toBeInTheDocument()
    stepper.focus()
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(simulate).toHaveBeenCalledWith(RUN, 'QF-0001', { lead_time_days: 22, target_coverage_weeks: 4, with_purchase: false }))
    expect(stepper).toHaveAttribute('aria-valuenow', '22')
    expect(await screen.findByRole('button', { name: 'Guardar tiempo de reposición' })).toBeInTheDocument()
  })

  it('sends the purchase scenario along with the edit', async () => {
    const { services, user } = product('QF-0001', '?compra=sugerida')
    const simulate = vi.spyOn(services.runs, 'simulate')
    await title('Ácido cítrico anhidro')
    await user.click(await screen.findByRole('button', { name: 'Aumentar la cobertura objetivo' }))
    await waitFor(() => expect(simulate).toHaveBeenCalledWith(RUN, 'QF-0001', { lead_time_days: 21, target_coverage_weeks: 5, with_purchase: true }))
  })

  it('saves the lead time as a per-product override and confirms it', async () => {
    const { services, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    await user.click(await screen.findByRole('button', { name: 'Aumentar el tiempo de reposición' }))
    await user.click(await screen.findByRole('button', { name: 'Guardar tiempo de reposición' }))
    expect(await screen.findByText('Tiempo de reposición guardado para Ácido cítrico anhidro')).toBeInTheDocument()
    const saved = await services.runs.product(RUN, 'QF-0001')
    expect(saved.product.lead_time_days).toBe(22)
    expect(saved.product.lead_time_overridden).toBe(true)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar tiempo de reposición' })).not.toBeInTheDocument())
  })

  it('reports a failed save with the support reference', async () => {
    const { services, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    await user.click(await screen.findByRole('button', { name: 'Aumentar el tiempo de reposición' }))
    const save = await screen.findByRole('button', { name: 'Guardar tiempo de reposición' })
    services.failRun = true
    await user.click(save)
    expect(await screen.findByText(/No pudimos guardar el tiempo de reposición\. Referencia: K7Q2WX/)).toBeInTheDocument()
  })
})

describe('reliability card', () => {
  it('explains the level in business language and reveals the technical detail on demand', async () => {
    const { user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    const card = within(await screen.findByRole('region', { name: 'Confiabilidad' }))
    expect(card.getByText('Alta')).toBeInTheDocument()
    expect(card.getByText(/El historial es suficiente/)).toBeInTheDocument()
    expect(card.queryByText('Modelo estadístico')).not.toBeInTheDocument()
    await user.click(card.getByRole('button', { name: 'Ver detalle técnico' }))
    expect(card.getByText('Modelo estadístico')).toBeInTheDocument()
    expect(card.getByText('40')).toBeInTheDocument()
    expect(card.getByText('38')).toBeInTheDocument()
    expect(card.getByText('22 %')).toBeInTheDocument()
  })

  it('never uses statistical jargon', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(main().queryByText(/intervalo de confianza|banda de confianza|SKU/i)).not.toBeInTheDocument()
  })
})

describe('scenario, chart and weekly table', () => {
  it('defaults to no new purchase and reflects the URL', async () => {
    const { router } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(await screen.findByRole('radio', { name: 'Sin nueva compra' })).toBeChecked()
    expect(router.state.location.search).toBe('')
  })

  it('opens on the suggested purchase when the URL says so', async () => {
    product('QF-0001', '?compra=sugerida')
    await title('Ácido cítrico anhidro')
    expect(await screen.findByRole('radio', { name: 'Con compra sugerida' })).toBeChecked()
  })

  it('switches the projection and the URL together, with the keyboard too', async () => {
    const { router, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    const table = within(await screen.findByRole('table', { name: 'Proyección semanal de Ácido cítrico anhidro' }))
    expect(table.queryByText('Llega compra')).not.toBeInTheDocument()
    const without = screen.getByRole('radio', { name: 'Sin nueva compra' })
    without.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Con compra sugerida' })).toHaveFocus()
    await user.keyboard(' ')
    await waitFor(() => expect(router.state.location.search).toBe('?compra=sugerida'))
    expect(await within(screen.getByRole('table', { name: 'Proyección semanal de Ácido cítrico anhidro' })).findByText('Llega compra')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Sin nueva compra' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('lists every projected week with the contract values unchanged', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    const table = await screen.findByRole('table', { name: 'Proyección semanal de Ácido cítrico anhidro' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + fixtures['QF-0001'].without_new_purchase.weekly.length)
    expect(within(rows[1]).getByText('19 oct 2026')).toBeInTheDocument()
    for (const header of ['Semana', 'Escenario bajo', 'Escenario esperado', 'Escenario alto', 'Stock proyectado', 'Faltante', 'Estado']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    expect(within(table).getAllByText('Sin stock').length).toBeGreaterThan(0)
  })

  it('draws an accessible chart with a table alternative', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(await screen.findByRole('img', { name: 'Historial, pronóstico y stock proyectado de Ácido cítrico anhidro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toBeInTheDocument()
  })

  it('shows empty states when the product has no projection', async () => {
    const { services } = product('QF-0001')
    const real = services.runs.product.bind(services.runs)
    vi.spyOn(services.runs, 'product').mockImplementation(async (runId, code) => {
      const detail = await real(runId, code)
      const empty = { weekly: [], series: [], stockout_zones: [], arrivals: [] }
      return { ...detail, without_new_purchase: empty, with_suggested_purchase: empty }
    })
    await title('Ácido cítrico anhidro')
    expect(await screen.findByText('Sin proyección semanal')).toBeInTheDocument()
    expect(screen.getByText('Aún no hay proyección')).toBeInTheDocument()
  })
})

describe('export', () => {
  it('requests the product export and downloads the file', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { services, user } = product('QF-0001')
    const createExport = vi.spyOn(services.runs, 'createExport')
    await title('Ácido cítrico anhidro')
    await user.click(await screen.findByRole('button', { name: 'Exportar producto' }))
    await waitFor(() => expect(createExport).toHaveBeenCalledWith(RUN, { format: 'xlsx', scope: 'product', codes: ['QF-0001'] }))
    expect(await screen.findByText('Exportación lista: pronostico-QF-0001.xlsx')).toBeInTheDocument()
    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('pronostico-QF-0001.xlsx')
    expect(anchor.href).toContain('storage.example.invalid')
  })

  it('reports a failed export with the support reference', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { services, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    const button = await screen.findByRole('button', { name: 'Exportar producto' })
    services.failRun = true
    await user.click(button)
    expect(await screen.findByText(/No pudimos exportar el producto\. Referencia: K7Q2WX/)).toBeInTheDocument()
    expect(click).not.toHaveBeenCalled()
  })
})

describe('ask about this product', () => {
  it('opens the product chat from the secondary button and keeps ?preguntar=1 in sync', async () => {
    const { router, user } = product('QF-0001')
    await title('Ácido cítrico anhidro')
    await user.click(await screen.findByRole('button', { name: 'Preguntar sobre este producto' }))
    const dialog = await screen.findByRole('dialog', { name: 'Preguntar sobre Ácido cítrico anhidro' })
    expect(router.state.location.search).toBe('?preguntar=1')
    const chat = within(dialog).getByTestId('chat-panel')
    expect(chat).toHaveAttribute('data-conversation', READY)
    expect(chat).toHaveAttribute('data-product', 'QF-0001')
    expect(within(dialog).getByText('¿Cuándo debo comprar Ácido cítrico anhidro?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar el asistente' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on load with ?preguntar=1 and keeps the scenario param', async () => {
    const { router } = product('QF-0001', '?compra=sugerida&preguntar=1')
    expect(await screen.findByRole('dialog', { name: 'Preguntar sobre Ácido cítrico anhidro' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?compra=sugerida&preguntar=1')
  })

  it('is a secondary action', async () => {
    product('QF-0001')
    await title('Ácido cítrico anhidro')
    expect(await screen.findByRole('button', { name: 'Preguntar sobre este producto' })).not.toHaveAttribute('data-variant', 'primary')
  })
})

describe('states', () => {
  it('shows a loading state first', async () => {
    product('QF-0001')
    expect(await screen.findByRole('status', { name: 'Cargando el producto…' })).toBeInTheDocument()
    await title('Ácido cítrico anhidro')
  })

  it('shows an error with retry and recovers', async () => {
    const { services, user } = product('QF-0001', '', {})
    services.failRun = true
    expect(await screen.findByText('No pudimos cargar el producto')).toBeInTheDocument()
    services.failRun = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await title('Ácido cítrico anhidro')
  })

  it('explains an unknown product and links back to the results', async () => {
    product('NOPE-1')
    expect(await screen.findByText('No encontramos este producto')).toBeInTheDocument()
    expect(main().getByRole('link', { name: 'Volver a los resultados' })).toHaveAttribute('href', `/c/${READY}`)
  })

  it('has nothing to show before the forecast is ready', async () => {
    renderApp({ path: `/c/${CALCULATING}/productos/QF-0001` })
    expect(await screen.findByText('Aún no hay resultados')).toBeInTheDocument()
  })
})
