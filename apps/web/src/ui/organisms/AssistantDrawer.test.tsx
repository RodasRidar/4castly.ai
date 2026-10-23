import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssistantDrawer, type AssistantDrawerProps } from './AssistantDrawer'

const props = (over: Partial<AssistantDrawerProps> = {}): AssistantDrawerProps => ({
  open: true,
  onOpenChange: vi.fn(),
  title: 'Preguntar sobre este producto',
  closeLabel: 'Cerrar',
  contextLine: 'Ácido cítrico 25 kg · PRQ-010130',
  thread: {
    label: 'Conversación',
    jumpLabel: 'Ir al último mensaje',
    emptyTitle: 'Sin mensajes',
    emptyBody: 'Haz una pregunta.',
    loadingLabel: 'Cargando',
    errorTitle: 'Error',
    errorBody: 'Intenta de nuevo.',
    retryLabel: 'Reintentar',
    messages: [{ id: '1', role: 'assistant', authorLabel: 'Asistente', text: 'Hola, ¿qué quieres saber?' }],
  },
  composer: {
    label: 'Mensaje',
    sendLabel: 'Enviar',
    stopLabel: 'Detener',
    hint: { send: 'para enviar', newline: 'nueva línea' },
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
  },
  suggestions: { label: 'Preguntas sugeridas', suggestions: ['¿Cuándo se agota?', '¿Cuánto debo comprar?'], onSelect: vi.fn() },
  ...over,
})

describe('AssistantDrawer', () => {
  it('is a named dialog with context line, thread, suggestions and composer', () => {
    render(<AssistantDrawer {...props()} />)
    const dlg = screen.getByRole('dialog', { name: 'Preguntar sobre este producto' })
    expect(within(dlg).getByText('Ácido cítrico 25 kg · PRQ-010130')).toBeInTheDocument()
    expect(within(dlg).getByRole('log', { name: 'Conversación' })).toBeInTheDocument()
    expect(within(dlg).getByRole('group', { name: 'Preguntas sugeridas' })).toBeInTheDocument()
    expect(within(dlg).getByRole('textbox', { name: 'Mensaje' })).toBeInTheDocument()
  })
  it('forwards suggestion selection', async () => {
    const p = props()
    render(<AssistantDrawer {...p} />)
    await userEvent.click(screen.getByRole('button', { name: '¿Cuándo se agota?' }))
    expect(p.suggestions?.onSelect).toHaveBeenCalledWith('¿Cuándo se agota?')
  })
  it('omits suggestions when not provided', () => {
    render(<AssistantDrawer {...props({ suggestions: undefined })} />)
    expect(screen.queryByRole('group', { name: 'Preguntas sugeridas' })).not.toBeInTheDocument()
  })
  it('requests close from the close button and Escape', async () => {
    const p = props()
    render(<AssistantDrawer {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(p.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('renders nothing when closed', () => {
    render(<AssistantDrawer {...props({ open: false })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
