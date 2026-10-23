import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatThread, type ChatThreadMessage, type ChatThreadProps } from './ChatThread'

const messages: ChatThreadMessage[] = [
  { id: '1', role: 'user', authorLabel: 'Tú', text: 'Hola', dividerLabel: 'Hoy' },
  { id: '2', role: 'assistant', authorLabel: 'Asistente', text: 'Encontré 142 productos.' },
]
const base: ChatThreadProps = {
  label: 'Conversación',
  jumpLabel: 'Ir al último mensaje',
  messages,
  emptyTitle: 'Aún no hay mensajes',
  emptyBody: 'Haz una pregunta sobre tu pronóstico.',
  loadingLabel: 'Cargando mensajes',
  errorTitle: 'No pudimos cargar la conversación',
  errorBody: 'Intenta de nuevo.',
  retryLabel: 'Reintentar',
}

function geometry(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const state = { scrollTop }
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => state.scrollTop, set: (v: number) => { state.scrollTop = v } })
  return state
}

describe('ChatThread', () => {
  it('is a log region with live announcements off for history', () => {
    render(<ChatThread {...base} />)
    const log = screen.getByRole('log', { name: 'Conversación' })
    expect(log).toHaveAttribute('aria-live', 'off')
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
  it('renders a labelled date divider before the message that asks for it', () => {
    render(<ChatThread {...base} />)
    expect(screen.getByRole('separator')).toHaveTextContent('Hoy')
  })
  it('shows the empty state', () => {
    render(<ChatThread {...base} messages={[]} />)
    expect(screen.getByText('Aún no hay mensajes')).toBeInTheDocument()
  })
  it('shows a busy skeleton while loading', () => {
    render(<ChatThread {...base} state="loading" messages={[]} />)
    expect(screen.getByRole('status', { name: 'Cargando mensajes' })).toHaveAttribute('aria-busy', 'true')
  })
  it('shows an error state with retry', async () => {
    const onRetry = vi.fn()
    render(<ChatThread {...base} state="error" messages={[]} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('follows new content while pinned to the bottom and shows no jump button', () => {
    const { rerender } = render(<ChatThread {...base} />)
    const log = screen.getByRole('log')
    const s = geometry(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    rerender(<ChatThread {...base} messages={[...messages, { id: '3', role: 'user', authorLabel: 'Tú', text: 'Gracias' }]} />)
    expect(s.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Ir al último mensaje' })).not.toBeInTheDocument()
  })
  it('pauses auto-scroll when the user scrolls up and offers a jump button', async () => {
    const { rerender } = render(<ChatThread {...base} />)
    const log = screen.getByRole('log')
    const s = geometry(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 })
    fireEvent.scroll(log)
    rerender(<ChatThread {...base} messages={[...messages, { id: '3', role: 'assistant', authorLabel: 'Asistente', text: 'Nuevo' }]} />)
    expect(s.scrollTop).toBe(100)
    const jump = screen.getByRole('button', { name: 'Ir al último mensaje' })
    await userEvent.click(jump)
    expect(s.scrollTop).toBe(1000)
    expect(screen.queryByRole('button', { name: 'Ir al último mensaje' })).not.toBeInTheDocument()
  })
  it('resumes following when the user scrolls back to the bottom', () => {
    const { rerender } = render(<ChatThread {...base} />)
    const log = screen.getByRole('log')
    const s = geometry(log, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 })
    fireEvent.scroll(log)
    act(() => {
      s.scrollTop = 600
      fireEvent.scroll(log)
    })
    rerender(<ChatThread {...base} messages={[...messages, { id: '3', role: 'assistant', authorLabel: 'Asistente', text: 'Nuevo' }]} />)
    expect(s.scrollTop).toBe(1000)
  })
})
