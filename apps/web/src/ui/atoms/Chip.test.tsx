import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  it('outline chip is a button that fires onClick', async () => {
    const onClick = vi.fn()
    render(<Chip onClick={onClick}>¿Qué productos están en riesgo?</Chip>)
    await userEvent.click(screen.getByRole('button', { name: '¿Qué productos están en riesgo?' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('selectable chip exposes pressed state', () => {
    const { rerender } = render(<Chip selectable selected={false}>14 días</Chip>)
    expect(screen.getByRole('button', { name: '14 días' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<Chip selectable selected>14 días</Chip>)
    expect(screen.getByRole('button', { name: '14 días' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('removable chip has a labelled remove button', async () => {
    const onRemove = vi.fn()
    render(<Chip onRemove={onRemove} removeLabel="Quitar filtro Riesgo: Crítico">Riesgo: Crítico</Chip>)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Riesgo: Crítico' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
  it('disabled chip is inert', async () => {
    const onClick = vi.fn()
    render(<Chip disabled onClick={onClick}>x</Chip>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
