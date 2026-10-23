import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ProfileForm, type ProfileFormProps } from './ProfileForm'

const base: ProfileFormProps = {
  label: 'Perfil',
  values: { name: 'María Pérez', role: 'Jefa de compras', email: 'maria@importadoraacme.cl', company: 'Importadora Acme' },
  fieldLabels: { name: 'Nombre', role: 'Cargo', email: 'Correo', company: 'Empresa' },
  saveLabel: 'Guardar',
  discardLabel: 'Descartar',
  savedText: 'Cambios guardados',
  loadingLabel: 'Cargando perfil',
  errorTitle: 'No pudimos cargar tu perfil',
  errorBody: 'Intenta de nuevo en unos segundos.',
  retryLabel: 'Reintentar',
  onRetry: () => {},
  onChange: () => {},
  onSubmit: () => {},
  onDiscard: () => {},
}

function Interactive() {
  const [values, setValues] = useState(base.values)
  const [status, setStatus] = useState<ProfileFormProps['status']>('pristine')
  return (
    <ProfileForm
      {...base}
      values={values}
      status={status}
      onChange={(f, v) => {
        setValues((p) => ({ ...p, [f]: v }))
        setStatus('dirty')
      }}
      onDiscard={() => {
        setValues(base.values)
        setStatus('pristine')
      }}
      onSubmit={() => setStatus('saved')}
    />
  )
}

const meta = { title: 'Organisms/ProfileForm', component: ProfileForm, args: base } satisfies Meta<typeof ProfileForm>
export default meta
type Story = StoryObj<typeof meta>

export const Pristine: Story = {}
export const Dirty: Story = { args: { status: 'dirty' } }
export const Saving: Story = { args: { status: 'saving' } }
export const Saved: Story = { args: { status: 'saved' } }
export const FieldError: Story = { args: { status: 'dirty', errors: { name: 'El nombre es obligatorio' } } }
export const Loading: Story = { args: { state: 'loading' } }
export const Error: Story = { args: { state: 'error' } }
export const Playground: Story = { render: () => <Interactive /> }
