import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Composer, type ComposerProps } from './Composer'

const base = {
  label: 'Mensaje',
  placeholder: 'Pregunta sobre tu pronóstico',
  sendLabel: 'Enviar',
  stopLabel: 'Detener',
  hint: { send: 'para enviar', newline: 'para salto de línea' },
}

function Demo(props: Partial<ComposerProps> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '')
  return <Composer {...base} value={value} onChange={setValue} onSend={() => {}} {...props} />
}

describe('Composer', () => {
  it('has a named textbox and a hint with Kbd keys', () => {
    render(<Demo />)
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveAttribute('placeholder', 'Pregunta sobre tu pronóstico')
    expect(screen.getByText('para enviar')).toBeInTheDocument()
    expect(document.querySelectorAll('kbd').length).toBe(3)
  })
  it('Enter sends the text', async () => {
    const onSend = vi.fn()
    render(<Demo onSend={onSend} />)
    await userEvent.type(screen.getByRole('textbox'), 'Hola{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Hola')
  })
  it('Shift+Enter inserts a newline and does not send', async () => {
    const onSend = vi.fn()
    render(<Demo onSend={onSend} />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, 'a{Shift>}{Enter}{/Shift}b')
    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('a\nb')
  })
  it('does not send empty or whitespace-only text', async () => {
    const onSend = vi.fn()
    render(<Demo onSend={onSend} />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '{Enter}')
    await userEvent.type(box, '   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })
  it('send button sends', async () => {
    const onSend = vi.fn()
    render(<Demo initial="Hola" onSend={onSend} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Hola')
  })
  it('swaps send for stop while generating, and Enter does not send', async () => {
    const onStop = vi.fn()
    const onSend = vi.fn()
    render(<Demo initial="Hola" generating onStop={onStop} onSend={onSend} />)
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox'), '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }))
    expect(onStop).toHaveBeenCalledOnce()
  })
  it('locked: disables the textarea and shows the reason as its description', () => {
    render(<Demo locked lockedReason="Confirma tus datos para hacer preguntas." />)
    const box = screen.getByRole('textbox', { name: 'Mensaje' })
    expect(box).toBeDisabled()
    expect(box).toHaveAccessibleDescription(expect.stringContaining('Confirma tus datos para hacer preguntas.'))
    expect(screen.getByText('Confirma tus datos para hacer preguntas.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })
  it('ignores Enter while an IME composition is active', async () => {
    const onSend = vi.fn()
    render(<Demo initial="日本" onSend={onSend} />)
    const box = screen.getByRole('textbox')
    box.focus()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
  })
})
