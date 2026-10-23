import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Toast, ToastProvider } from './Toast'

function setup(props: Partial<React.ComponentProps<typeof Toast>> = {}) {
  const onOpenChange = vi.fn()
  render(
    <ToastProvider label="Notificaciones">
      <Toast open onOpenChange={onOpenChange} variant="info" title="Conversación archivada" dismissLabel="Cerrar" {...props} />
    </ToastProvider>,
  )
  return { onOpenChange, item: screen.getAllByRole('listitem')[0] as HTMLElement }
}

describe('Toast', () => {
  beforeAll(() => {
    // jsdom lacks pointer capture, which Radix Toast calls on pointer events.
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.setPointerCapture ??= () => {}
    Element.prototype.releasePointerCapture ??= () => {}
  })

  it('renders title and description', () => {
    const { item } = setup({ description: 'La encontrarás en el historial.' })
    expect(within(item).getByText('Conversación archivada')).toBeInTheDocument()
    expect(within(item).getByText('La encontrarás en el historial.')).toBeInTheDocument()
  })
  it.each(['info', 'success', 'error'] as const)('exposes variant %s', (variant) => {
    const { item } = setup({ variant })
    expect(item).toHaveAttribute('data-variant', variant)
  })
  it('renders the viewport as a labelled region', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Notificaciones' })).toBeInTheDocument()
  })
  it('dismiss button is named by prop and closes', async () => {
    const { onOpenChange, item } = setup()
    await userEvent.click(within(item).getByRole('button', { name: 'Cerrar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('renders an optional action and fires onAction', async () => {
    const onAction = vi.fn()
    const { item } = setup({ actionLabel: 'Deshacer', onAction })
    await userEvent.click(within(item).getByRole('button', { name: 'Deshacer' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
  it('has no action button when none is given', () => {
    const { item } = setup()
    expect(within(item).getAllByRole('button')).toHaveLength(1)
  })
  it('does not render when closed', () => {
    render(
      <ToastProvider label="Notificaciones">
        <Toast open={false} onOpenChange={() => {}} variant="info" title="Oculto" dismissLabel="Cerrar" />
      </ToastProvider>,
    )
    expect(screen.queryByText('Oculto')).not.toBeInTheDocument()
  })
})
