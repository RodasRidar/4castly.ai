import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColumnHeader } from './ColumnHeader'

function inTable(ui: React.ReactNode) {
  return render(
    <table>
      <thead>
        <tr>{ui}</tr>
      </thead>
    </table>,
  )
}

describe('ColumnHeader', () => {
  it('renders a th with scope=col', () => {
    inTable(<ColumnHeader label="Producto" />)
    expect(screen.getByRole('columnheader', { name: 'Producto' })).toHaveAttribute('scope', 'col')
  })
  it('is not sortable without sort prop: no button, no aria-sort', () => {
    inTable(<ColumnHeader label="Producto" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader')).not.toHaveAttribute('aria-sort')
  })
  it.each([
    ['none', 'none'],
    ['asc', 'ascending'],
    ['desc', 'descending'],
  ] as const)('maps sort=%s to aria-sort=%s', (sort, aria) => {
    inTable(<ColumnHeader label="Riesgo" sort={sort} sortLabel="Ordenar por Riesgo" onSort={() => {}} />)
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', aria)
  })
  it('exposes the sort button with its accessible name and fires onSort by mouse and keyboard', async () => {
    const onSort = vi.fn()
    inTable(<ColumnHeader label="Riesgo" sort="none" sortLabel="Ordenar por Riesgo" onSort={onSort} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por Riesgo' }))
    await userEvent.keyboard('{Enter}')
    expect(onSort).toHaveBeenCalledTimes(2)
  })
  it('applies sticky positioning only when requested', () => {
    const { rerender } = render(
      <table><thead><tr><ColumnHeader label="A" /></tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).not.toHaveClass('sticky')
    rerender(<table><thead><tr><ColumnHeader label="A" sticky /></tr></thead></table>)
    expect(screen.getByRole('columnheader')).toHaveClass('sticky')
  })
})
