import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileChip } from './FileChip'

const name = 'Kardex_movimientos_importaciones_2025.xlsx'

describe('FileChip', () => {
  it('shows the full name accessibly plus the size', () => {
    render(<FileChip name={name} size="1,2 MB" />)
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.getByText('1,2 MB')).toBeInTheDocument()
    expect(screen.getByTitle(name)).toBeInTheDocument()
  })
  it('calls remove and change handlers with accessible names', async () => {
    const onRemove = vi.fn()
    const onChange = vi.fn()
    render(<FileChip name={name} removeLabel="Quitar archivo" onRemove={onRemove} changeLabel="Cambiar archivo" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar archivo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar archivo' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })
  it('omits actions when no handlers are given', () => {
    render(<FileChip name={name} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('uploading state shows a busy spinner and text', () => {
    render(<FileChip name={name} state="uploading" uploadingText="Subiendo…" />)
    expect(screen.getByText('Subiendo…')).toBeInTheDocument()
    expect(screen.getByTestId('file-chip')).toHaveAttribute('aria-busy', 'true')
  })
  it('error state announces the message', () => {
    render(<FileChip name={name} state="error" errorText="No se pudo leer el archivo" />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer el archivo')
    expect(screen.getByTestId('file-chip')).toHaveAttribute('data-state', 'error')
  })
})
