import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConversationList, type ConversationListGroup } from './ConversationList'

const groups: ConversationListGroup[] = [
  { id: 'pinned', title: 'Fijados', items: [{ id: '1', title: 'Ácido cítrico 25 kg', href: '/c/1', pinned: true }] },
  { id: 'today', title: 'Hoy', items: [{ id: '2', title: 'Glicerina USP', href: '/c/2', active: true, status: 'processing' }] },
  { id: 'week', title: 'Esta semana', items: [] },
  { id: 'older', title: 'Antes', items: [{ id: '3', title: 'Sorbitol 70 %', href: '/c/3', status: 'failed' }] },
]
const labels = {
  label: 'Conversaciones',
  loadingLabel: 'Cargando conversaciones',
  emptyTitle: 'Aún no hay conversaciones',
  emptyBody: 'Sube un Kardex para empezar.',
  errorTitle: 'No pudimos cargar tus conversaciones',
  errorBody: 'Intenta de nuevo.',
  retryLabel: 'Reintentar',
  pinnedLabel: 'Fijada',
  processingLabel: 'Calculando',
  failedLabel: 'Falló',
  renameLabel: 'Renombrar conversación',
}

describe('ConversationList', () => {
  it('renders non-empty groups with titles and items, skipping empty groups', () => {
    render(<ConversationList {...labels} groups={groups} />)
    expect(screen.getByRole('heading', { name: 'Fijados' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Esta semana' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Antes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Glicerina USP/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('img', { name: 'Fijada' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Calculando' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Falló' })).toBeInTheDocument()
  })
  it('fires onSelect for button rows', async () => {
    const onSelect = vi.fn()
    render(<ConversationList {...labels} onSelect={onSelect} groups={[{ id: 'today', title: 'Hoy', items: [{ id: '9', title: 'Sin enlace' }] }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sin enlace' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('9')
  })
  it('renders the menu slot per item', () => {
    render(<ConversationList {...labels} groups={groups} renderMenu={(item) => <button>{`Menú ${item.id}`}</button>} />)
    expect(screen.getByRole('button', { name: 'Menú 2' })).toBeInTheDocument()
  })
  it('renames the item in renamingId and forwards the result', async () => {
    const onRename = vi.fn()
    render(<ConversationList {...labels} groups={groups} renamingId="2" onRename={onRename} onRenameCancel={() => {}} />)
    const input = screen.getByRole('textbox', { name: 'Renombrar conversación' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Nuevo{Enter}')
    expect(onRename).toHaveBeenCalledExactlyOnceWith('2', 'Nuevo')
  })
  it('shows skeletons with a busy status while loading', () => {
    render(<ConversationList {...labels} groups={[]} state="loading" />)
    const status = screen.getByRole('status', { name: 'Cargando conversaciones' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
  it('shows the empty state when there are no items', () => {
    render(<ConversationList {...labels} groups={[{ id: 'today', title: 'Hoy', items: [] }]} />)
    expect(screen.getByText('Aún no hay conversaciones')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hoy' })).not.toBeInTheDocument()
  })
  it('shows the error state with a retry action', async () => {
    const onRetry = vi.fn()
    render(<ConversationList {...labels} groups={[]} state="error" onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
