import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProfileForm, type ProfileFormProps } from './ProfileForm'

const props = (over: Partial<ProfileFormProps> = {}): ProfileFormProps => ({
  label: 'Perfil',
  values: { name: 'María Pérez', role: 'Jefa de compras', email: 'maria@acme.cl', company: 'Importadora Acme' },
  fieldLabels: { name: 'Nombre', role: 'Cargo', email: 'Correo', company: 'Empresa' },
  saveLabel: 'Guardar',
  discardLabel: 'Descartar',
  savedText: 'Cambios guardados',
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onDiscard: vi.fn(),
  ...over,
})

describe('ProfileForm', () => {
  it('has editable name/role and read-only email/company', () => {
    render(<ProfileForm {...props()} />)
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('María Pérez')
    expect(screen.getByRole('textbox', { name: 'Nombre' })).not.toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'Cargo' })).toHaveValue('Jefa de compras')
    expect(screen.getByRole('textbox', { name: 'Correo' })).toHaveAttribute('readonly')
    expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveAttribute('readonly')
    expect(screen.getAllByTestId('input-lock')).toHaveLength(2)
  })
  it('pristine: no Guardar or Descartar', () => {
    render(<ProfileForm {...props()} />)
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
  })
  it('reports field changes', async () => {
    const p = props()
    render(<ProfileForm {...p} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Cargo' }), 'x')
    expect(p.onChange).toHaveBeenCalledWith('role', 'Jefa de comprasx')
  })
  it('dirty: shows primary Guardar and secondary Descartar', async () => {
    const p = props({ status: 'dirty' })
    render(<ProfileForm {...p} />)
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Descartar' })).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(p.onDiscard).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(p.onSubmit).toHaveBeenCalledOnce()
  })
  it('submits with Enter from a field', async () => {
    const p = props({ status: 'dirty' })
    render(<ProfileForm {...p} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), '{Enter}')
    expect(p.onSubmit).toHaveBeenCalledOnce()
  })
  it('saving: Guardar is busy and disabled, Descartar disabled', () => {
    render(<ProfileForm {...props({ status: 'saving' })} />)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled()
  })
  it('saved: announces the saved text in a status region', () => {
    render(<ProfileForm {...props({ status: 'saved' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados')
  })
  it('shows field errors', () => {
    render(<ProfileForm {...props({ status: 'dirty', errors: { name: 'El nombre es obligatorio' } })} />)
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toBeInvalid()
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre es obligatorio')
  })
  it('loading: skeleton, no inputs', () => {
    render(<ProfileForm {...props({ state: 'loading', loadingLabel: 'Cargando perfil' })} />)
    expect(screen.getByRole('status', { name: 'Cargando perfil' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('error: shows an error state with retry', async () => {
    const onRetry = vi.fn()
    render(<ProfileForm {...props({ state: 'error', errorTitle: 'No pudimos cargar tu perfil', errorBody: 'Intenta de nuevo.', retryLabel: 'Reintentar', onRetry })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tu perfil')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
