import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatStreamEvent } from '../../services/types'
import { controlledStream, delta, EMPTY, end, renderPanel, SEEDED, start } from './testing'

const ASK = 'Escribe tu pregunta'
const FAILED_ID = 'a5465f77-bfc3-565e-8ef3-ca4ad55e1afc'

type Panel = ReturnType<typeof renderPanel>

/**
 * Replaces `chat.send` with a hand-driven stream and `chat.list` with a store that behaves like the mock: the user
 * message is stored when the question is sent and the assistant message once its stream has ended.
 */
function drive(panel: Panel) {
  let ctl!: ReturnType<typeof controlledStream>
  const stored: ChatMessage[] = []
  const message = (partial: Partial<ChatMessage>): ChatMessage => ({
    id: crypto.randomUUID(),
    conversation_id: EMPTY,
    role: 'user',
    status: 'complete',
    display_text: '',
    payload: { kind: 'text' },
    annotations: [],
    context_product_code: null,
    feedback: null,
    created_at: '2026-10-23T09:00:00Z',
    ...partial,
  })

  async function* persist(stream: AsyncIterable<ChatStreamEvent>, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    let text = ''
    let status: ChatMessage['status'] = 'complete'
    let payload: ChatMessage['payload'] = { kind: 'text' }
    for await (const event of stream) {
      if (event.event === 'text.delta') text += event.text
      if (event.event === 'error') {
        status = 'error'
        payload = { kind: 'error', message_key: event.message_key, ref: event.ref }
      }
      yield event
    }
    // Like the real server: an answer the client aborted is stored as interrupted, with no closing frame.
    if (signal?.aborted) status = 'interrupted'
    stored.push(message({ id: 'm-ctl', role: 'assistant', status, display_text: text, payload }))
  }

  const send = vi.fn((_c: string, m: { text: string }, signal?: AbortSignal) => {
    ctl = controlledStream(signal)
    stored.push(message({ display_text: m.text }))
    return persist(ctl.stream, signal)
  })
  panel.services.chat.send = send as unknown as typeof panel.services.chat.send
  panel.services.chat.list = async () => structuredClone(stored)
  return { send, ctl: () => ctl }
}

async function ask(panel: Panel, text: string) {
  await panel.user.type(await screen.findByRole('textbox', { name: ASK }), `${text}{Enter}`)
}

const lastAssistant = () => screen.getAllByRole('article', { name: 'Asistente' }).at(-1)!

describe('transcript', () => {
  it('shows the seeded conversation: file, stage messages and the answer with its figures as links', async () => {
    renderPanel()
    const log = await screen.findByRole('log', { name: 'Conversación con el asistente' })
    expect(within(log).getAllByText('kardex_oct.xlsx').length).toBeGreaterThan(0)
    expect(within(log).getByText('Estoy leyendo tu archivo.')).toBeInTheDocument()
    expect(within(log).getByText('¿Qué debo comprar primero?')).toBeInTheDocument()
    expect(within(log).getByRole('link', { name: '7 productos críticos' })).toHaveAttribute('href', `/c/${SEEDED}?riesgo=critical`)
    expect(within(log).getByRole('link', { name: 'Acetona grado reactivo' })).toHaveAttribute('href', `/c/${SEEDED}/productos/QF-0011`)
    expect(within(log).getByRole('link', { name: 'Ácido cítrico anhidro' })).toHaveAttribute('href', `/c/${SEEDED}/productos/QF-0001`)
  })

  it('keeps the partial text of an interrupted answer, with no Retry once a newer answer exists', async () => {
    renderPanel()
    const partial = (await screen.findByText(/Esa respuesta se cortó antes de terminar/)).closest('article')!
    expect(within(partial).getByText('La respuesta se detuvo antes de terminar.')).toBeInTheDocument()
    // Only the latest answer can be retried (the API answers 409 `errors.retryNotLatest` for older ones).
    expect(within(partial).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('shows a failed answer with its short reference and Retry, never a raw code', async () => {
    renderPanel()
    const failed = (await screen.findByText('Referencia: K7Q2WX')).closest('article')!
    expect(within(failed).getByText('No pudimos responder')).toBeInTheDocument()
    expect(within(failed).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByText('errors.assistant')).not.toBeInTheDocument()
  })

  it('shows an empty state for a conversation without messages', async () => {
    renderPanel({ conversationId: EMPTY })
    expect(await screen.findByText('Haz tu primera pregunta')).toBeInTheDocument()
  })

  it('shows the error state for a failing list and recovers on Retry', async () => {
    let attempts = 0
    const services = renderPanelWithList(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('down')
      return []
    })
    expect(await screen.findByText('No pudimos cargar los mensajes')).toBeInTheDocument()
    await services.user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Haz tu primera pregunta')).toBeInTheDocument()
  })

  it('announces a loading state while the list is pending', async () => {
    renderPanelWithList(() => new Promise<ChatMessage[]>(() => {}))
    expect(await screen.findByRole('status', { name: 'Cargando mensajes…' })).toBeInTheDocument()
  })

  it('ignores annotations with invalid offsets and keeps the text exactly as given', async () => {
    const message: ChatMessage = {
      id: 'x1',
      conversation_id: SEEDED,
      role: 'assistant',
      status: 'complete',
      display_text: 'Hay 3 productos críticos.',
      payload: { kind: 'text' },
      annotations: [
        { start: 0, end: 999, type: 'product', code: 'QF-1' },
        { start: 8, end: 8, type: 'product', code: 'QF-2' },
        { start: 6, end: 15, type: 'filter', link: { q: null, risk: 'critical', abc: null, count: 3 } },
        { start: 10, end: 20, type: 'product', code: 'QF-3' },
      ],
      context_product_code: null,
      feedback: null,
      created_at: '2026-10-23T09:00:00Z',
    }
    renderPanelWithList(async () => [message])
    const article = (await screen.findByRole('link', { name: 'productos' })).closest('article')!
    expect(within(article).getAllByRole('link')).toHaveLength(1)
    expect(within(article).getByRole('link', { name: 'productos' })).toHaveAttribute('href', `/c/${SEEDED}?riesgo=critical`)
    expect(article).toHaveTextContent('Hay 3 productos críticos.')
  })
})

/** Mounts the panel with `chat.list` replaced before the first fetch. */
function renderPanelWithList(list: () => Promise<ChatMessage[]>) {
  return renderPanel({ list })
}

describe('sending', () => {
  it('shows the user message at once, then the tool status, then the text token by token, then finishes', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { ctl } = drive(panel)
    await ask(panel, 'hola')

    const bubble = await screen.findByText('hola')
    expect(bubble.closest('article')).toHaveAttribute('data-role', 'user')
    expect(screen.getByRole('textbox', { name: ASK })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Detener' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()

    await act(async () => ctl().push(start))
    await act(async () => ctl().push({ event: 'tool.start', tool_call_id: 't1', status_key: 'assistant.tool.reviewingCritical' }))
    expect(await screen.findByText('Revisando los productos críticos…')).toBeInTheDocument()

    await act(async () => ctl().push({ event: 'tool.end', tool_call_id: 't1' }))
    await waitFor(() => expect(screen.queryByText('Revisando los productos críticos…')).not.toBeInTheDocument())

    await act(async () => ctl().push(delta('7 ')))
    expect(await screen.findByText(/^7/)).toBeInTheDocument()
    await act(async () => ctl().push(delta('productos críticos.')))
    expect(await screen.findByText('7 productos críticos.')).toBeInTheDocument()
    expect(within(lastAssistant()).queryByRole('group', { name: 'Acciones del mensaje' })).not.toBeInTheDocument()

    await act(async () => {
      ctl().push(end())
      ctl().close()
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    expect(within(lastAssistant()).getByRole('group', { name: 'Acciones del mensaje' })).toBeInTheDocument()
  })

  it('announces only the start and the end of an answer, not every token', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { ctl } = drive(panel)
    await ask(panel, 'hola')
    const live = await screen.findByText('El asistente está escribiendo…')
    expect(live.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')

    await act(async () => ctl().push(delta('uno ')))
    await act(async () => ctl().push(delta('dos ')))
    expect(live.textContent).toBe('El asistente está escribiendo…')

    await act(async () => {
      ctl().push(end())
      ctl().close()
    })
    await waitFor(() => expect(screen.getByText('Respuesta completa')).toBeInTheDocument())
  })

  it('stops generating: keeps the partial text, marks it and offers Retry', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { ctl, send } = drive(panel)
    await ask(panel, 'hola')
    await act(async () => ctl().push(start))
    await act(async () => ctl().push(delta('respuesta a medias')))
    expect(await screen.findByText('respuesta a medias')).toBeInTheDocument()

    await panel.user.click(screen.getByRole('button', { name: 'Detener' }))
    expect((send.mock.calls[0][2] as AbortSignal).aborted).toBe(true)

    const article = (await screen.findByText('respuesta a medias')).closest('article')!
    await waitFor(() => expect(within(article).getByText('La respuesta se detuvo antes de terminar.')).toBeInTheDocument())
    expect(within(article).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Detener' })).not.toBeInTheDocument()
    // A stream that just ends after Stop (no message.end) is announced as stopped, not as completed.
    expect(screen.getByText('Respuesta detenida')).toBeInTheDocument()
    expect(screen.queryByText('Respuesta completa')).not.toBeInTheDocument()
  })

  it('shows a stream error with its reference and keeps the partial text', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { ctl } = drive(panel)
    await ask(panel, 'hola')
    await act(async () => ctl().push(start))
    await act(async () => ctl().push(delta('parcial')))
    await act(async () => {
      ctl().push({ event: 'error', message_key: 'errors.assistant', ref: 'K7Q2WX' } as ChatStreamEvent)
      ctl().close()
    })
    const article = (await screen.findByText('parcial')).closest('article')!
    expect(await within(article).findByText('Referencia: K7Q2WX')).toBeInTheDocument()
    expect(within(article).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('completes a real mock stream end to end and keeps the cited figure as a link', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    await ask(panel, '¿Qué debo comprar primero?')
    await waitFor(() => expect(screen.getByText('Respuesta completa')).toBeInTheDocument())
    const answer = lastAssistant()
    expect(answer).toHaveTextContent('7 productos críticos. Empieza por Acetona grado reactivo y Ácido cítrico anhidro.')
    expect(within(answer).getByRole('link', { name: '7 productos críticos' })).toHaveAttribute('href', `/c/${EMPTY}?riesgo=critical`)
    expect(screen.getByText('¿Qué debo comprar primero?')).toBeInTheDocument()
  })

  it('forwards the product scope as context', async () => {
    const panel = renderPanel({ conversationId: EMPTY, productCode: 'QF-0001' })
    const { send } = drive(panel)
    await ask(panel, 'hola')
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(send.mock.calls[0][0]).toBe(EMPTY)
    expect(send.mock.calls[0][1]).toEqual({ text: 'hola', context_product_code: 'QF-0001' })
  })

  it('sends on Enter, inserts a new line on Shift+Enter and disables Send when empty', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { send } = drive(panel)
    const box = await screen.findByRole('textbox', { name: ASK })
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await panel.user.type(box, 'línea 1{Shift>}{Enter}{/Shift}línea 2')
    expect(box).toHaveValue('línea 1\nlínea 2')
    expect(send).not.toHaveBeenCalled()
    await panel.user.keyboard('{Enter}')
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0][1]).toMatchObject({ text: 'línea 1\nlínea 2' })
  })

  it('does not send while an answer is being generated', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { send } = drive(panel)
    await ask(panel, 'primera')
    await screen.findByRole('button', { name: 'Detener' })
    await panel.user.type(screen.getByRole('textbox', { name: ASK }), 'segunda{Enter}')
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('message actions', () => {
  it('copies the answer text and confirms', async () => {
    const panel = renderPanel()
    const article = (await screen.findByRole('link', { name: '7 productos críticos' })).closest('article')!
    await panel.user.click(within(article).getByRole('button', { name: 'Copiar' }))
    expect(await navigator.clipboard.readText()).toBe('7 productos críticos. Empieza por Acetona grado reactivo y Ácido cítrico anhidro.')
    expect(await screen.findByText('Respuesta copiada')).toBeInTheDocument()
  })

  it('toggles like and dislike from the stored rating, persisting each change through the service', async () => {
    const panel = renderPanel()
    const spy = vi.spyOn(panel.services.chat, 'feedback')
    const id = 'bdfaedb8-8b1d-54f5-b56a-9b95a583f0b6'
    const article = (await screen.findByRole('link', { name: '7 productos críticos' })).closest('article')!
    const like = within(article).getByRole('button', { name: 'Respuesta útil' })
    const dislike = within(article).getByRole('button', { name: 'Respuesta no útil' })
    // The seeded answer was already rated helpful.
    expect(like).toHaveAttribute('aria-pressed', 'true')

    await panel.user.click(like)
    await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'false'))
    expect(spy).toHaveBeenLastCalledWith(id, null)

    await panel.user.click(dislike)
    await waitFor(() => expect(dislike).toHaveAttribute('aria-pressed', 'true'))
    expect(spy).toHaveBeenLastCalledWith(id, 'down')

    await panel.user.click(like)
    await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'true'))
    expect(dislike).toHaveAttribute('aria-pressed', 'false')
    expect(spy).toHaveBeenLastCalledWith(id, 'up')
  })

  it('rolls the feedback back and says so when saving fails', async () => {
    const panel = renderPanel()
    panel.services.chat.feedback = vi.fn().mockRejectedValue(new Error('down'))
    const article = (await screen.findByRole('link', { name: '7 productos críticos' })).closest('article')!
    const like = within(article).getByRole('button', { name: 'Respuesta útil' })
    const dislike = within(article).getByRole('button', { name: 'Respuesta no útil' })
    await panel.user.click(dislike)
    expect(await screen.findByText('No pudimos guardar tu valoración')).toBeInTheDocument()
    expect(dislike).toHaveAttribute('aria-pressed', 'false')
    expect(like).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers Retry only on the last complete answer, not on earlier ones or stage messages', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    await ask(panel, 'primera')
    await waitFor(() => expect(screen.getByText('Respuesta completa')).toBeInTheDocument())
    await ask(panel, 'segunda')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reintentar respuesta' })).toHaveLength(1))
    const answers = screen.getAllByRole('article', { name: 'Asistente' })
    expect(within(answers[0]).queryByRole('button', { name: 'Reintentar respuesta' })).not.toBeInTheDocument()
    expect(within(answers[1]).getByRole('button', { name: 'Reintentar respuesta' })).toBeInTheDocument()
  })
})

describe('retry', () => {
  it('re-asks a failed answer by appending a new one, keeping the failed one without a second retry', async () => {
    const panel = renderPanel()
    const retry = vi.spyOn(panel.services.chat, 'retry')
    const before = (await screen.findAllByRole('article', { name: 'Asistente' })).length
    const failed = (await screen.findByText('Referencia: K7Q2WX')).closest('article')!
    await panel.user.click(within(failed).getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledWith(FAILED_ID, expect.any(AbortSignal))
    await waitFor(() => expect(screen.getAllByRole('article', { name: 'Asistente' })).toHaveLength(before + 1))
    // The failed answer stays in the history, but only the newest one can be retried (the API answers 409 otherwise).
    const stillFailed = screen.getByText('No pudimos responder').closest('article')!
    expect(within(stillFailed).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('retries the last complete answer', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    await ask(panel, 'hola')
    await waitFor(() => expect(screen.getByText('Respuesta completa')).toBeInTheDocument())
    const retry = vi.spyOn(panel.services.chat, 'retry')
    await panel.user.click(within(lastAssistant()).getByRole('button', { name: 'Reintentar respuesta' }))
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByRole('article', { name: 'Asistente' })).toHaveLength(2))
  })
})

describe('suggestions', () => {
  it('shows nothing without suggestions', async () => {
    renderPanel({ conversationId: EMPTY })
    await screen.findByRole('textbox', { name: ASK })
    expect(screen.queryByRole('group', { name: 'Preguntas sugeridas' })).not.toBeInTheDocument()
  })

  it('sends a suggestion when clicked and hides the chips while answering', async () => {
    const panel = renderPanel({ conversationId: EMPTY, suggestions: ['¿Qué debo comprar primero?', '¿Cuáles están en riesgo?'] })
    const { send } = drive(panel)
    await panel.user.click(await screen.findByRole('button', { name: '¿Cuáles están en riesgo?' }))
    expect(send.mock.calls[0][1]).toMatchObject({ text: '¿Cuáles están en riesgo?' })
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Preguntas sugeridas' })).not.toBeInTheDocument())
  })
})

describe('scrolling', () => {
  it('stops following when the user scrolls up and offers a jump to the latest message', async () => {
    const panel = renderPanel({ conversationId: EMPTY })
    const { ctl } = drive(panel)
    await ask(panel, 'hola')
    await act(async () => ctl().push(start))
    const log = await screen.findByRole('log', { name: 'Conversación con el asistente' })

    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 100 })
    log.scrollTop = 0
    fireEvent.scroll(log)

    await act(async () => ctl().push(delta('más texto')))
    const jump = await screen.findByRole('button', { name: 'Ir al último mensaje' })
    await panel.user.click(jump)
    expect(log.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Ir al último mensaje' })).not.toBeInTheDocument()
  })
})

describe('language', () => {
  it('speaks English when the app does', async () => {
    renderPanel({ language: 'en' })
    expect(await screen.findByRole('log', { name: 'Conversation with the assistant' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Type your question' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Reference: K7Q2WX')).toBeInTheDocument()
  })
})
