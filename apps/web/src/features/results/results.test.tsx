import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import { pollConfig } from '../conversation/useConversationData'
import { ApiFailure } from '../../services/types'

// Unit C owns the chat; here we only care that the layout mounts it where the plan says.
vi.mock('../chat/ChatPanel', () => ({
  ChatPanel: ({ conversationId }: { conversationId: string }) => <div data-testid="chat-panel" data-conversation={conversationId} />,
}))

const READY = 'c5d30c23-398a-5d64-a690-c2086b0def35'
const RUN = 'b3984a50-ec9f-5ff8-acdc-763d348729cf'
const path = (search = '') => `/c/${READY}${search}`

const failure = () =>
  new ApiFailure({ type: 'about:blank', title: 'x', status: 500, code: 'internal_error', message_key: 'errors.internal', ref: 'K7Q2WX' })

/** The table (with skeleton rows) appears first; wait for the real rows. */
const table = async () => {
  const el = await screen.findByRole('table', { name: 'Productos y su riesgo de quiebre' })
  await waitFor(() => expect(screen.queryByText('Cargando productos')).not.toBeInTheDocument())
  return el
}
const bodyRows = async () => within(await table()).getAllByRole('row').slice(1)

const citricRow = async () => {
  const rows = await bodyRows()
  const row = rows.find((r) => within(r).queryByText('Ácido cítrico anhidro'))
  if (!row) throw new Error('row not found')
  return row
}

afterEach(() => {
  vi.restoreAllMocks()
  pollConfig.ms = 1000
})

describe('results screen', () => {
  it('shows the breadcrumb, the KPIs, the chart and the table next to the chat', async () => {
    renderApp({ path: path() })
    const crumb = await screen.findByRole('navigation', { name: 'Ruta de navegación' })
    expect(within(crumb).getByText('Proyecciones')).toBeInTheDocument()
    expect(within(crumb).getByText('Resultados')).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: 'Indicadores del pronóstico' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Demanda semanal/ })).toBeInTheDocument()
    expect(await table()).toBeInTheDocument()
    expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-conversation', READY)
  })

  it('lists critical products first by default and pages at 25', async () => {
    renderApp({ path: path() })
    const rows = await bodyRows()
    expect(rows).toHaveLength(25)
    expect(within(rows[0]).getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('moves to the next page and keeps it in the URL', async () => {
    const { router, user } = renderApp({ path: path() })
    await table()
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(router.state.location.search).toBe('?pagina=2'))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1))
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
  })

  it('filters by risk, writes it to the URL and resets the page', async () => {
    const { router, user } = renderApp({ path: path('?pagina=2') })
    await table()
    await user.selectOptions(screen.getByLabelText('Riesgo'), 'critical')
    await waitFor(() => expect(router.state.location.search).toBe('?riesgo=critical'))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(7))
    for (const r of await bodyRows()) expect(within(r).getByText('Crítico')).toBeInTheDocument()
    expect(screen.getByText('7 de 26 en foco')).toBeInTheDocument()
  })

  it('filters by ABC class', async () => {
    const { router, user } = renderApp({ path: path() })
    await table()
    await user.selectOptions(screen.getByLabelText('Clase ABC'), 'B')
    await waitFor(() => expect(router.state.location.search).toBe('?abc=B'))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(4))
  })

  it('searches ignoring accents and case, debounced, and keeps it in the URL', async () => {
    const { router, user } = renderApp({ path: path() })
    await table()
    await user.type(screen.getByRole('textbox', { name: 'Buscar producto' }), 'ACIDO')
    await waitFor(() => expect(router.state.location.search).toBe('?q=ACIDO'))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1))
    expect(screen.getByText('Ácido cítrico anhidro')).toBeInTheDocument()
  })

  it('restores filters from the URL on load', async () => {
    renderApp({ path: path('?riesgo=critical&abc=A&orden=name:desc') })
    expect((await bodyRows()).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Riesgo')).toHaveValue('critical')
    expect(screen.getByLabelText('Clase ABC')).toHaveValue('A')
  })

  it('resets everything from the focus chip', async () => {
    const { router, user } = renderApp({ path: path('?riesgo=critical') })
    await table()
    await user.click(await screen.findByRole('button', { name: 'Restablecer' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(25))
  })

  it('introduces the KPI cards with a level 2 heading so heading levels do not skip', async () => {
    renderApp({ path: path() })
    expect(await screen.findByRole('heading', { level: 2, name: 'Indicadores del pronóstico' })).toBeInTheDocument()
  })

  it('applies the critical filter from the at-risk KPI link', async () => {
    const { router, user } = renderApp({ path: path() })
    const kpis = await screen.findByRole('group', { name: 'Indicadores del pronóstico' })
    await user.click(await within(kpis).findByRole('link', { name: /Ver productos en riesgo/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?riesgo=critical'))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(7))
  })

  it('sorts by a column in both directions through the URL', async () => {
    const { router, user } = renderApp({ path: path() })
    await table()
    await user.click(screen.getByRole('button', { name: 'Ordenar por Producto' }))
    await waitFor(() => expect(router.state.location.search).toBe('?orden=name%3Aasc'))
    await user.click(screen.getByRole('button', { name: 'Ordenar por Producto' }))
    await waitFor(() => expect(router.state.location.search).toBe('?orden=name%3Adesc'))
    await waitFor(async () => expect((await bodyRows())[0]).toHaveTextContent('Tapa rosca'))
  })

  it('shows the empty state with a reset when nothing matches', async () => {
    const { router, user } = renderApp({ path: path('?q=zzzz') })
    expect(await screen.findByText('Ningún producto coincide con los filtros')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restablecer filtros' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(async () => expect(await bodyRows()).toHaveLength(25))
  })

  it('opens a product from its name', async () => {
    const { router, user } = renderApp({ path: path('?riesgo=critical') })
    await user.click(await screen.findByRole('button', { name: /Ácido cítrico anhidro/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${READY}/productos/QF-0001`))
    expect(router.state.location.search).toBe('')
  })

  it('explains a failure and recovers on retry', async () => {
    const { services, user } = renderApp({ path: path() })
    services.failRun = true
    expect(await screen.findByText('No pudimos cargar los resultados')).toBeInTheDocument()
    services.failRun = false
    await user.click(screen.getAllByRole('button', { name: 'Reintentar' })[0])
    expect(await table()).toBeInTheDocument()
  })

  it('warns when the run is stale', async () => {
    const { services } = renderApp({ path: path() })
    const original = services.runs.summary.bind(services.runs)
    services.runs.summary = async (id) => {
      const s = await original(id)
      return { ...s, run: { ...s.run, stale: true } }
    }
    expect(await screen.findByText(/cambiaste los parámetros/)).toBeInTheDocument()
  })

  it('lists the defaults used when the questions were skipped and opens the parameters from the notice', async () => {
    const { services, user } = renderApp({ path: path() })
    const original = services.runs.summary.bind(services.runs)
    services.runs.summary = async (id) => {
      const s = await original(id)
      return { ...s, run: { ...s.run, defaults_used: ['lead_time', 'target_coverage'] } }
    }
    const notice = await screen.findByText(/Usamos valores por defecto/)
    expect(notice).toHaveTextContent('tiempo de reposición')
    await user.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(await screen.findByRole('dialog', { name: 'Parámetros del pronóstico' })).toBeInTheDocument()
  })
})

describe('units and chart', () => {
  it('lets you pick the unit when the run has several', async () => {
    const { user } = renderApp({ path: path() })
    const unit = await screen.findByLabelText('Unidad')
    expect(within(unit).getAllByRole('option').map((o) => o.textContent)).toEqual(['kg', 'L', 'u'])
    await user.selectOptions(unit, 'L')
    expect(unit).toHaveValue('L')
  })
})

describe('header actions', () => {
  it('copies the link and says so', async () => {
    const { user } = renderApp({ path: path('?riesgo=critical') })
    await user.click(await screen.findByRole('button', { name: 'Compartir enlace' }))
    await waitFor(async () => expect(await navigator.clipboard.readText()).toContain(`/c/${READY}?riesgo=critical`))
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument()
  })

  it('exports everything, downloads the file and confirms with its name', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = renderApp({ path: path() })
    await user.click(await screen.findByRole('button', { name: 'Exportar' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Exportar todo' }))
    expect(await screen.findByText('Archivo listo: pronostico-todos.xlsx')).toBeInTheDocument()
    expect(click).toHaveBeenCalled()
  })

  it('tells you when the export fails', async () => {
    const { services, user } = renderApp({ path: path() })
    services.runs.createExport = async () => {
      throw failure()
    }
    await user.click(await screen.findByRole('button', { name: 'Exportar' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Exportar todo' }))
    expect(await screen.findByText(/No pudimos preparar el archivo/)).toBeInTheDocument()
  })
})

describe('portfolio view', () => {
  it('switches views from the tabs through the vista param', async () => {
    const { router, user } = renderApp({ path: path() })
    await table()
    await user.click(screen.getByRole('tab', { name: 'Portafolio' }))
    await waitFor(() => expect(router.state.location.search).toBe('?vista=portafolio'))
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Chat + resultados' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })

  it('adds the purchase columns and opens the assistant from the Preguntar button', async () => {
    const { user } = renderApp({ path: path('?vista=portafolio') })
    const t = await table()
    for (const column of ['Cantidad sugerida', 'Comprar antes de', 'Tiempo de reposición']) {
      expect(within(t).getByRole('columnheader', { name: new RegExp(column) })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Preguntar' }))
    const drawer = await screen.findByRole('dialog', { name: 'Preguntar sobre tus resultados' })
    expect(within(drawer).getByTestId('chat-panel')).toHaveAttribute('data-conversation', READY)
  })

  it('exports the selection from the bulk bar', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = renderApp({ path: path('?vista=portafolio') })
    const rows = await bodyRows()
    await user.click(within(rows[0]).getByRole('checkbox'))
    const bar = await screen.findByRole('toolbar')
    expect(within(bar).getByText('1 seleccionado')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Exportar selección' }))
    expect(await screen.findByText('Archivo listo: pronostico-seleccion.xlsx')).toBeInTheDocument()
  })

  it('saves an edited lead time as an override, keeps showing it, and offers to apply it on the next calculation', async () => {
    const { services, user } = renderApp({ path: path('?vista=portafolio&riesgo=critical') })
    const setOverrides = vi.spyOn(services.runs, 'setOverrides')
    const original = (await services.runs.product(RUN, 'QF-0001')).product.lead_time_days
    const row = await citricRow()
    await user.click(within(row).getByRole('button', { name: /Editar tiempo de reposición/ }))
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '60{Enter}')
    await waitFor(() => expect(setOverrides).toHaveBeenCalledWith('QF-0001', { lead_time_days: 60 }))
    // The API only applies overrides on the next calculation, so its row still has the old value...
    expect((await services.runs.product(RUN, 'QF-0001')).product.lead_time_days).toBe(original)
    // ...but the table must not silently revert what the user just saved, even after the rows are fetched again.
    await user.click(screen.getByRole('button', { name: 'Ordenar por Producto' }))
    await user.click(screen.getByRole('button', { name: 'Ordenar por Producto' }))
    const again = await citricRow()
    expect(within(again).getByRole('button', { name: /Editar tiempo de reposición/ }).textContent).toContain('60')
    expect(await screen.findByText('Cambiaste el tiempo de reposición de 1 producto. Se aplicará al recalcular.')).toBeInTheDocument()
  })

  it('applies pending lead times when the user recalculates, and the notice goes away', async () => {
    pollConfig.ms = 20
    const { services, user } = renderApp({ path: path('?vista=portafolio&riesgo=critical') })
    const row = await citricRow()
    await user.click(within(row).getByRole('button', { name: /Editar tiempo de reposición/ }))
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '60{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Recalcular' }))
    await waitFor(async () => expect((await services.conversations.get(READY)).stage).toBe('calculating'))
    for (let i = 0; i < 5; i++) services.advance()
    await waitFor(async () => expect((await services.conversations.get(READY)).stage).toBe('ready'))
    expect((await services.runs.product(RUN, 'QF-0001')).product.lead_time_days).toBe(60)
    expect(await citricRow()).toBeTruthy()
    expect(screen.queryByText(/Cambiaste el tiempo de reposición/)).not.toBeInTheDocument()
  })

  it('rolls the lead time back and says so when saving fails', async () => {
    const { services, user } = renderApp({ path: path('?vista=portafolio&riesgo=critical') })
    services.runs.setOverrides = async () => {
      throw failure()
    }
    const row = await citricRow()
    const edit = () => within(row).getByRole('button', { name: /Editar tiempo de reposición/ })
    const before = edit().textContent
    // The refetch after the failure must not be what restores the value: only the rollback may.
    services.runs.products = () => new Promise(() => {})
    await user.click(edit())
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '60{Enter}')
    expect(await screen.findByText(/No pudimos guardar el tiempo de reposición/)).toBeInTheDocument()
    await waitFor(async () => {
      const again = await citricRow()
      expect(within(again).getByRole('button', { name: /Editar tiempo de reposición/ }).textContent).toBe(before)
    })
  })
})

describe('parameters drawer', () => {
  it('saves the parameters and starts the recalculation, which returns the conversation to calculating', async () => {
    const { services, user } = renderApp({ path: path() })
    await user.click(await screen.findByRole('button', { name: 'Parámetros' }))
    const drawer = await screen.findByRole('dialog', { name: 'Parámetros del pronóstico' })
    await user.click(within(drawer).getByRole('radio', { name: '24 semanas' }))
    await user.click(within(drawer).getByRole('button', { name: 'Recalcular' }))
    await waitFor(async () => expect((await services.conversations.get(READY)).stage).toBe('calculating'))
    expect((await services.runs.summary(RUN)).run.parameters.horizon_weeks).toBe(24)
    expect(await screen.findByRole('log', { name: 'Conversación' })).toBeInTheDocument()
  })

  it('opens from the keyboard and closes with Escape', async () => {
    const { user } = renderApp({ path: path() })
    const button = await screen.findByRole('button', { name: 'Parámetros' })
    button.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Parámetros del pronóstico' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('copy in English', () => {
  it('translates the screen', async () => {
    renderApp({ path: path(), language: 'en', preferences: { locale: 'en' } })
    expect(await screen.findByRole('button', { name: 'Share link' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Products and their stockout risk' })).toBeInTheDocument()
  })
})

describe('run notices from the contract flags', () => {
  /** `stock_known` is a summary field; `parameters_pending` belongs to the run (see the generated schema). */
  const withSummary = (
    services: ReturnType<typeof renderApp>['services'],
    patch: { stock_known?: boolean; parameters_pending?: boolean; stale?: boolean },
  ) => {
    const original = services.runs.summary.bind(services.runs)
    services.runs.summary = async (id) => {
      const s = await original(id)
      const { stock_known = s.stock_known, ...run } = patch
      return { ...s, stock_known, run: { ...s.run, ...run } }
    }
  }

  it('says nothing when the file had stock and nothing is pending', async () => {
    renderApp({ path: path() })
    await table()
    expect(screen.queryByText(/columna de stock/)).not.toBeInTheDocument()
    expect(screen.queryByText(/aún no se aplican/)).not.toBeInTheDocument()
  })

  it('says only demand and reliability are shown when the file had no stock column', async () => {
    const { services } = renderApp({ path: path() })
    withSummary(services, { stock_known: false })
    expect(await screen.findByText(/Tu archivo no incluye stock: mostramos demanda y fiabilidad, no riesgo ni compras/)).toBeInTheDocument()
  })

  it('offers Recalcular for parameters that were saved but not applied, and starts the recalculation', async () => {
    const { services, user, router } = renderApp({ path: path() })
    withSummary(services, { parameters_pending: true })
    expect(await screen.findByText('Guardaste parámetros nuevos que aún no se aplican.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recalcular' }))
    await waitFor(async () => expect((await services.conversations.get(READY)).stage).toBe('calculating'))
    expect(router.state.location.pathname).toBe(`/c/${READY}`)
  })

  it('shows a single notice when parameters and lead times are both waiting to be applied', async () => {
    const { services, user } = renderApp({ path: path('?vista=portafolio&riesgo=critical') })
    withSummary(services, { parameters_pending: true })
    const row = await citricRow()
    await user.click(within(row).getByRole('button', { name: /Editar tiempo de reposición/ }))
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '45{Enter}')
    expect(await screen.findByText('Guardaste parámetros y tiempos de reposición que aún no se aplican.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Recalcular' })).toHaveLength(1)
    expect(screen.queryByText('Guardaste parámetros nuevos que aún no se aplican.')).not.toBeInTheDocument()
  })

  it('shows one coherent notice when both pending parameters and a stale run are reported', async () => {
    const { services } = renderApp({ path: path() })
    withSummary(services, { parameters_pending: true, stale: true })
    expect(await screen.findByText('Guardaste parámetros nuevos que aún no se aplican.')).toBeInTheDocument()
    expect(screen.queryByText(/cambiaste los parámetros/)).not.toBeInTheDocument()
  })

  it('tells the user when the recalculation cannot start', async () => {
    const { services, user } = renderApp({ path: path() })
    withSummary(services, { parameters_pending: true })
    services.runs.recalculate = async () => {
      throw failure()
    }
    await user.click(await screen.findByRole('button', { name: 'Recalcular' }))
    expect(await screen.findByText(/Algo salió mal de nuestro lado.*Referencia: K7Q2WX/)).toBeInTheDocument()
  })

  it('uses English copy in English', async () => {
    const { services } = renderApp({ path: path(), language: 'en', preferences: { locale: 'en' } })
    withSummary(services, { parameters_pending: true, stock_known: false })
    expect(await screen.findByText('You saved new parameters that are not applied yet.')).toBeInTheDocument()
    expect(screen.getByText(/Your file has no stock/)).toBeInTheDocument()
  })
})
