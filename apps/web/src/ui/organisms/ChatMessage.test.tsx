import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

const actions = {
  label: 'Acciones del mensaje',
  copyLabel: 'Copiar',
  retryLabel: 'Reintentar',
  likeLabel: 'Me gusta',
  dislikeLabel: 'No me gusta',
  onCopy: vi.fn(),
  onLike: vi.fn(),
  onDislike: vi.fn(),
}

describe('ChatMessage', () => {
  it('user variant shows the text with an author label', () => {
    render(<ChatMessage role="user" authorLabel="Tú" text="¿Cuánto stock queda de ácido cítrico?" />)
    const msg = screen.getByRole('article', { name: 'Tú' })
    expect(msg).toHaveAttribute('data-role', 'user')
    expect(msg).toHaveTextContent('¿Cuánto stock queda de ácido cítrico?')
  })
  it('user variant can show a file attachment', () => {
    render(<ChatMessage role="user" authorLabel="Tú" file={{ name: 'kardex-2026.xlsx', size: '1,2 MB' }} />)
    expect(screen.getByTestId('file-chip')).toHaveTextContent('kardex-2026.xlsx')
  })
  it('assistant variant renders markdown, tool lines, actions and the embedded card', async () => {
    const onRetry = vi.fn()
    const props: ChatMessageProps = {
      role: 'assistant',
      authorLabel: 'Asistente',
      text: 'El **ácido cítrico** se agota en 3 semanas.',
      toolLines: ['Consultando el stock de Glicerina…'],
      actions: { ...actions, onRetry },
      card: <div>Tarjeta de producto</div>,
    }
    render(<ChatMessage {...props} />)
    const msg = screen.getByRole('article', { name: 'Asistente' })
    expect(msg).toHaveAttribute('data-role', 'assistant')
    expect(screen.getByText('ácido cítrico').tagName).toBe('STRONG')
    expect(screen.getByRole('status')).toHaveTextContent('Consultando el stock de Glicerina…')
    expect(screen.getByText('Tarjeta de producto')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
  it('marks the text region busy while streaming', () => {
    render(<ChatMessage role="assistant" authorLabel="Asistente" text="Calculando" streaming />)
    expect(screen.getByTestId('streaming-cursor')).toBeInTheDocument()
  })
  it('hides actions while streaming', () => {
    render(<ChatMessage role="assistant" authorLabel="Asistente" text="Hola" streaming actions={actions} />)
    expect(screen.queryByRole('group', { name: 'Acciones del mensaje' })).not.toBeInTheDocument()
  })
  it('shows a partial/error note while keeping the partial text', () => {
    render(
      <ChatMessage
        role="assistant"
        authorLabel="Asistente"
        text="Respuesta parcial"
        note={{ tone: 'warning', title: 'Respuesta incompleta', text: 'Se cortó la conexión.' }}
      />,
    )
    expect(screen.getByText('Respuesta parcial')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Respuesta incompleta')
    expect(screen.getByRole('status')).toHaveTextContent('Se cortó la conexión.')
  })
})
