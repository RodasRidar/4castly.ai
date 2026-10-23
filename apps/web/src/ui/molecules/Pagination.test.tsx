import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

const labels = { label: 'Paginación', prevLabel: 'Página anterior', nextLabel: 'Página siguiente' }
const text = (p: number, t: number) => `Página ${p} de ${t}`

describe('Pagination', () => {
  it('is a nav landmark with the given label', () => {
    render(<Pagination {...labels} page={2} total={5} pageText={text(2, 5)} onPageChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
  })
  it('marks the current page text with aria-current', () => {
    render(<Pagination {...labels} page={2} total={5} pageText={text(2, 5)} onPageChange={() => {}} />)
    expect(screen.getByText('Página 2 de 5')).toHaveAttribute('aria-current', 'page')
  })
  it('goes to previous and next pages', async () => {
    const onPageChange = vi.fn()
    render(<Pagination {...labels} page={2} total={5} pageText={text(2, 5)} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3)
  })
  it('disables previous on the first page', () => {
    render(<Pagination {...labels} page={1} total={5} pageText={text(1, 5)} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled()
  })
  it('disables next on the last page', () => {
    render(<Pagination {...labels} page={5} total={5} pageText={text(5, 5)} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled()
  })
  it('is keyboard operable', async () => {
    const onPageChange = vi.fn()
    render(<Pagination {...labels} page={2} total={5} pageText={text(2, 5)} onPageChange={onPageChange} />)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onPageChange).toHaveBeenCalledWith(1)
  })
})
