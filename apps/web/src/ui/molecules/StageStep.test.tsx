import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StageStep } from './StageStep'

describe('StageStep', () => {
  it.each([
    ['done', 'Completado'],
    ['active', 'En curso'],
    ['pending', 'Pendiente'],
  ] as const)('%s exposes label and status as text', (status, statusLabel) => {
    render(
      <ol>
        <StageStep status={status} label="Leyendo archivo" statusLabel={statusLabel} />
      </ol>,
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Leyendo archivo')
    expect(item).toHaveTextContent(statusLabel)
    expect(item).toHaveAttribute('data-status', status)
  })
  it('marks only the active step as current', () => {
    const { rerender } = render(
      <ol>
        <StageStep status="active" label="a" statusLabel="s" />
      </ol>,
    )
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-current', 'step')
    rerender(
      <ol>
        <StageStep status="done" label="a" statusLabel="s" />
      </ol>,
    )
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-current')
  })
  it('shows a spinner only for the active step', () => {
    const { container, rerender } = render(
      <ol>
        <StageStep status="active" label="a" statusLabel="s" />
      </ol>,
    )
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    rerender(
      <ol>
        <StageStep status="done" label="a" statusLabel="s" />
      </ol>,
    )
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})
