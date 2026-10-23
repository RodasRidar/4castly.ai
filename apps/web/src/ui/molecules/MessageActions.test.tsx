import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageActions } from './MessageActions'

const labels = { label: 'Acciones del mensaje', copyLabel: 'Copiar', retryLabel: 'Reintentar', likeLabel: 'Me gusta', dislikeLabel: 'No me gusta' }

describe('MessageActions', () => {
  it('renders a labelled group of named buttons', () => {
    render(<MessageActions {...labels} onCopy={() => {}} onRetry={() => {}} onLike={() => {}} onDislike={() => {}} />)
    expect(screen.getByRole('group', { name: 'Acciones del mensaje' })).toBeInTheDocument()
    for (const n of ['Copiar', 'Reintentar', 'Me gusta', 'No me gusta']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
  })
  it('fires callbacks', async () => {
    const f = { onCopy: vi.fn(), onRetry: vi.fn(), onLike: vi.fn(), onDislike: vi.fn() }
    render(<MessageActions {...labels} {...f} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Me gusta' }))
    await userEvent.click(screen.getByRole('button', { name: 'No me gusta' }))
    for (const fn of Object.values(f)) expect(fn).toHaveBeenCalledOnce()
  })
  it('retry is optional', () => {
    render(<MessageActions {...labels} onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })
  it('like and dislike are toggles with aria-pressed', () => {
    const { rerender } = render(<MessageActions {...labels} onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />)
    expect(screen.getByRole('button', { name: 'Me gusta' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<MessageActions {...labels} liked onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />)
    expect(screen.getByRole('button', { name: 'Me gusta' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'No me gusta' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<MessageActions {...labels} disliked onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />)
    expect(screen.getByRole('button', { name: 'No me gusta' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('is keyboard operable', async () => {
    const onCopy = vi.fn()
    render(<MessageActions {...labels} onCopy={onCopy} onLike={() => {}} onDislike={() => {}} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Copiar' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onCopy).toHaveBeenCalledOnce()
  })
})
