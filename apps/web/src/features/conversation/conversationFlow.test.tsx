import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../app/testing'
import { failure } from '../../services/mock/errors'
import { pollConfig } from './useConversationData'

const ID = {
  ready: 'c5d30c23-398a-5d64-a690-c2086b0def35',
  queued: '9de1432d-6f0d-5de1-aef7-fb99e66d5dec',
  uploaded: '613ff002-83a2-53bd-bce4-8cd093092263',
  digesting: '1c83c75b-dc59-5910-a286-b7d4f2b7d931',
  unreadable: '326d9ee5-f388-5c34-9878-9c2c8ccea3de',
  needsDate: '9b22a139-26e6-558c-bc48-01981253ddfa',
  awaiting: '5f33ca8b-1e88-5451-9488-5586835e88aa',
  confirmed: '0125b09d-d144-5e6d-8a68-814f20a9d46c',
  clarifying: '1391746e-7e1d-5db2-9e85-8c4fa7d9dba8',
  calculating: '1f17e33b-9af2-505c-839c-3635dd414f56',
  failed: '1c764588-6acb-52c2-afbe-eacff43ad096',
  cancelled: 'f0de5dc9-56b0-5338-bf8f-15e0ae6bc175',
}

const open = (key: keyof typeof ID, options: Parameters<typeof renderApp>[0] = {}) => renderApp({ path: `/c/${ID[key]}`, ...options })

type App = ReturnType<typeof renderApp>
const advance = (app: App, times: number) => act(() => void Array.from({ length: times }, () => app.services.advance()))

// The sidebar can list a conversation with the same title; assertions about the thread stay inside it.
const thread = () => within(screen.getByRole('log', { name: 'Conversación' }))
const composer = () => screen.getByRole('textbox', { name: 'Escribe tu pregunta' })

beforeEach(() => {
  pollConfig.ms = 20
})
afterEach(() => {
  pollConfig.ms = 1000
})

describe('digestion (03)', () => {
  it('shows only the stages of the running job and locks the composer with a reason', async () => {
    open('digesting')
    const steps = await screen.findByRole('list', { name: 'Progreso de la lectura' })
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Leyendo archivoCompletado',
      'Identificando columnasEn curso',
      'Listo para pronosticarPendiente',
    ])
    expect(screen.queryByText('Limpiando datos')).not.toBeInTheDocument()
    expect(composer()).toBeDisabled()
    expect(screen.getByText('Podrás hacer preguntas cuando confirmes tus datos.')).toBeInTheDocument()
    expect(thread().getAllByText('ventas_2026.xlsx').length).toBeGreaterThan(0)
  })

  it('moves to the confirmation screen when the backend finishes digesting', async () => {
    const app = open('digesting')
    await screen.findByRole('list', { name: 'Progreso de la lectura' })
    await advance(app, 2)
    expect(await screen.findByRole('heading', { name: 'Columnas detectadas' })).toBeInTheDocument()
  })

  it('shows every step pending while the job is queued', async () => {
    open('queued')
    const steps = await screen.findByRole('list', { name: 'Progreso de la lectura' })
    expect(within(steps).getAllByText('Pendiente')).toHaveLength(3)
  })

  it('shows a simple loader when the upload has no job yet', async () => {
    open('uploaded')
    expect(await screen.findByText('Preparando la lectura…')).toBeInTheDocument()
  })

  it('cancels the digestion from the thread', async () => {
    const app = open('digesting')
    await app.user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('Cancelaste la lectura de este archivo')).toBeInTheDocument()
    expect((await app.services.conversations.get(ID.digesting)).stage).toBe('cancelled')
  })
})

describe('error stages (08a, cancelled)', () => {
  it('explains a password-protected file and offers another upload', async () => {
    const app = open('unreadable')
    expect(await screen.findByText('El archivo está protegido con contraseña')).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Subir otro archivo' }))
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/nuevo'))
  })

  it('shows the neutral cancelled message', async () => {
    const app = open('cancelled')
    expect(await screen.findByText('Cancelaste la lectura de este archivo')).toBeInTheDocument()
    await app.user.click(screen.getByRole('link', { name: 'Subir otro archivo' }))
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/nuevo'))
  })
})

describe('missing date column (08b)', () => {
  it('lists plausible columns with samples and keeps the picker when the file has no dates', async () => {
    const app = open('needsDate')
    const list = await screen.findByRole('listbox', { name: 'Columnas que parecen fechas' })
    expect(within(list).getByText('Periodo')).toBeInTheDocument()
    expect(within(list).getByText('12/01/2026, 20/01/2026')).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Mi archivo no tiene fechas' }))
    expect(screen.getByText(/Necesitamos fechas para calcular un pronóstico/)).toBeInTheDocument()
    expect(screen.getByRole('listbox', { name: 'Columnas que parecen fechas' })).toBeInTheDocument()
    expect((await app.services.conversations.get(ID.needsDate)).stage).toBe('needs_date_column')
  })

  it('confirms a plan around the chosen column and moves on to the questions', async () => {
    const app = open('needsDate')
    const use = await screen.findByRole('button', { name: 'Usar esta columna' })
    expect(use).toBeDisabled()
    await app.user.click(await screen.findByRole('option', { name: /Emisión/ }))
    await app.user.click(use)
    expect(await screen.findByRole('heading', { name: 'Para calcular mejor' })).toBeInTheDocument()
    const plan = await app.services.conversations.getPlan(ID.needsDate)
    expect(plan.status).toBe('confirmed')
    expect(plan.plan?.date).toEqual({ column: 'Emisión', format: 'dd/mm/yyyy' })
  })
})

describe('confirmation (04)', () => {
  it('summarises the file and lists the detected columns and warnings', async () => {
    open('awaiting')
    expect(await screen.findByText('Encontré 26 productos y 9 meses de historia.')).toBeInTheDocument()
    expect(screen.getByText(/Los datos van del .*2026 al .*2026/)).toBeInTheDocument()
    expect(screen.getByText('3 productos tienen poco historial, así que su pronóstico será menos confiable.')).toBeInTheDocument()
    const card = screen.getByTestId('column-mapping-card')
    expect(within(card).getByText('Fecha Doc')).toBeInTheDocument()
    expect(within(card).getByText('Código del producto')).toBeInTheDocument()
    expect(composer()).toBeDisabled()
  })

  it('confirms and collapses into the confirmed line', async () => {
    const app = open('awaiting')
    await app.user.click(await screen.findByRole('button', { name: 'Sí, es correcto' }))
    expect(await thread().findByText('Datos confirmados')).toBeInTheDocument()
    expect((await app.services.conversations.get(ID.awaiting)).stage).toBe('clarifying')
    expect(screen.queryByRole('button', { name: 'Sí, es correcto' })).not.toBeInTheDocument()
  })

  it('edits the mapping and confirms the corrected plan', async () => {
    const app = open('awaiting')
    await app.user.click(await screen.findByRole('button', { name: 'Corregir' }))
    await app.user.selectOptions(screen.getByLabelText('Stock'), 'Cant')
    await app.user.click(screen.getByRole('button', { name: 'Guardar y confirmar' }))
    await thread().findByText('Datos confirmados')
    const plan = await app.services.conversations.getPlan(ID.awaiting)
    expect(plan.plan?.stock).toEqual({ column: 'Cant', decimal_separator: ',' })
    expect(plan.proposed_by).toBe('user')
  })

  it('leaves edit mode without saving', async () => {
    const app = open('awaiting')
    await app.user.click(await screen.findByRole('button', { name: 'Corregir' }))
    await app.user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Sí, es correcto' })).toBeInTheDocument()
    expect((await app.services.conversations.get(ID.awaiting)).stage).toBe('awaiting_confirmation')
  })

  it('reports a failed confirmation and keeps the screen', async () => {
    const app = open('awaiting')
    vi.spyOn(app.services.conversations, 'confirmPlan').mockRejectedValue(failure('failure'))
    await app.user.click(await screen.findByRole('button', { name: 'Sí, es correcto' }))
    expect(await screen.findByText('No pudimos confirmar tus datos. Inténtalo de nuevo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sí, es correcto' })).toBeInTheDocument()
  })

  it('shows how movements are counted for a Kardex report, with nothing to correct', async () => {
    const app = renderApp({ path: '/historial' })
    const file = { file_name: 'kardex_x.xlsx', size_bytes: 1000, content_type: 'application/vnd.ms-excel' }
    const ticket = await app.services.uploads.create(file)
    const { conversation_id } = await app.services.uploads.complete(ticket.upload_id)
    await advance(app, 4)
    await act(() => app.router.navigate(`/c/${conversation_id}`))
    expect(await screen.findByText('Cómo cuento los movimientos')).toBeInTheDocument()
    expect(screen.getByText('Devolución de cliente')).toBeInTheDocument()
    expect(screen.getAllByText('Cuenta como venta')).toHaveLength(1)
    expect(screen.getByText('Resta como devolución')).toBeInTheDocument()
    expect(screen.getAllByText('No se usa')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Sí, es correcto' }))
    expect(await screen.findByRole('heading', { name: 'Para calcular mejor' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /sin stock/ })).not.toBeInTheDocument()
  })

  it('reads in English when the language preference is English', async () => {
    open('awaiting', { preferences: { locale: 'en' } })
    expect(await screen.findByText('I found 26 products and 9 months of history.')).toBeInTheDocument()
  })
})

describe('confirmed data (04-confirmado)', () => {
  it('expands the detail, unlocks the composer and fills it from a suggestion', async () => {
    const app = open('confirmed')
    const toggle = await screen.findByRole('button', { name: 'Ver detalle' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await app.user.click(toggle)
    expect(screen.getByRole('button', { name: 'Ocultar detalle' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Cod Art')).toBeInTheDocument()
    expect(composer()).toBeEnabled()
    await app.user.click(screen.getByRole('button', { name: '¿Qué productos están en riesgo?' }))
    expect(composer()).toHaveValue('¿Qué productos están en riesgo?')
  })
})

describe('clarification (05)', () => {
  it('needs every shown answer before it can calculate, then starts the forecast job', async () => {
    const app = open('clarifying')
    const start = vi.spyOn(app.services.conversations, 'startForecast')
    const calculate = await screen.findByRole('button', { name: 'Calcular pronóstico' })
    expect(calculate).toBeDisabled()
    await app.user.click(within(screen.getByRole('group', { name: /Cuántos días/ })).getByRole('button', { name: '14 días' }))
    expect(calculate).toBeDisabled()
    await app.user.click(within(screen.getByRole('group', { name: /sin stock/ })).getByRole('button', { name: 'No' }))
    expect(calculate).toBeEnabled()
    await app.user.click(calculate)
    expect(start).toHaveBeenCalledWith(ID.clarifying, { answers: { lead_time_days: 14, had_stockouts: 'no' }, skip: false })
    expect(await screen.findByRole('progressbar', { name: 'Avance del cálculo' })).toBeInTheDocument()
  })

  it('accepts a typed lead time and rejects anything that is not a positive whole number', async () => {
    const app = open('clarifying')
    const start = vi.spyOn(app.services.conversations, 'startForecast')
    await app.user.click(within(await screen.findByRole('group', { name: /Cuántos días/ })).getByRole('button', { name: 'Otro' }))
    await app.user.type(screen.getByRole('textbox', { name: 'Días de reposición' }), 'abc')
    await app.user.click(within(screen.getByRole('group', { name: /sin stock/ })).getByRole('button', { name: 'No lo sé' }))
    expect(screen.getByRole('button', { name: 'Calcular pronóstico' })).toBeDisabled()
    await app.user.clear(screen.getByRole('textbox', { name: 'Días de reposición' }))
    await app.user.type(screen.getByRole('textbox', { name: 'Días de reposición' }), '21')
    await app.user.click(screen.getByRole('button', { name: 'Calcular pronóstico' }))
    expect(start).toHaveBeenCalledWith(ID.clarifying, { answers: { lead_time_days: 21, had_stockouts: 'unknown' }, skip: false })
  })

  it('skips the questions and forecasts with defaults', async () => {
    const app = open('clarifying')
    const start = vi.spyOn(app.services.conversations, 'startForecast')
    await app.user.click(await screen.findByRole('button', { name: 'Omitir y pronosticar ahora' }))
    expect(start).toHaveBeenCalledWith(ID.clarifying, { skip: true })
  })

  it('reports a failed start and keeps the questions', async () => {
    const app = open('clarifying')
    vi.spyOn(app.services.conversations, 'startForecast').mockRejectedValue(failure('failure'))
    await app.user.click(await screen.findByRole('button', { name: 'Omitir y pronosticar ahora' }))
    expect(await screen.findByText('No pudimos iniciar el cálculo. Inténtalo de nuevo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcular pronóstico' })).toBeInTheDocument()
  })
})

describe('calculation (05-calculando) and results seam', () => {
  it('counts processed products without any percentage', async () => {
    open('calculating')
    expect(await screen.findByText('14 de 26 productos')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avance del cálculo' })).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    const steps = screen.getByRole('list', { name: 'Progreso del cálculo' })
    expect(within(steps).getByText('Calculando pronóstico')).toBeInTheDocument()
  })

  it('walks the whole flow from the questions to the results placeholder', async () => {
    const app = open('clarifying')
    await app.user.click(await screen.findByRole('button', { name: 'Omitir y pronosticar ahora' }))
    await screen.findByRole('progressbar', { name: 'Avance del cálculo' })
    await advance(app, 4)
    expect(await screen.findByText(/Tu pronóstico está listo/)).toBeInTheDocument()
    expect((await app.services.conversations.get(ID.clarifying)).stage).toBe('ready')
  })

  it('shows the results placeholder for a ready conversation', async () => {
    open('ready')
    expect(await screen.findByText(/Tu pronóstico está listo/)).toBeInTheDocument()
  })
})

describe('failure (08d)', () => {
  it('offers human copy, a support link and a retry that asks the questions again', async () => {
    const app = open('failed')
    expect(await screen.findByText('No pudimos calcular tu pronóstico')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contactar soporte' })).toHaveAttribute('href', 'mailto:soporte@4castly.ai')
    expect(screen.queryByText(/Referencia/)).not.toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }))
    const start = vi.spyOn(app.services.conversations, 'startForecast')
    await app.user.click(await screen.findByRole('button', { name: 'Omitir y pronosticar ahora' }))
    expect(start).toHaveBeenCalled()
    expect(await screen.findByRole('progressbar', { name: 'Avance del cálculo' })).toBeInTheDocument()
  })
})

describe('loading the conversation', () => {
  it('shows the not-found page for an unknown conversation', async () => {
    renderApp({ path: '/c/00000000-0000-0000-0000-000000000000' })
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('shows an error state with retry when the conversation cannot be loaded', async () => {
    const app = renderApp({ path: '/historial' })
    const get = vi.spyOn(app.services.conversations, 'get').mockRejectedValueOnce(failure('failure'))
    await act(() => app.router.navigate(`/c/${ID.awaiting}`))
    expect(await screen.findByText('No pudimos abrir esta conversación')).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Columnas detectadas' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })
})
