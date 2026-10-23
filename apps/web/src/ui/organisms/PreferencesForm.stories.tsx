import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { PreferencesForm, type PreferencesFormProps } from './PreferencesForm'

const base: PreferencesFormProps = {
  label: 'Preferencias',
  values: { theme: 'system', language: 'es', timezone: 'America/Santiago' },
  fieldLabels: { theme: 'Tema', language: 'Idioma', timezone: 'Zona horaria' },
  themeOptions: [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Sistema' },
  ],
  languageOptions: [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ],
  timezoneOptions: [
    { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
    { value: 'America/Lima', label: 'Lima (GMT-5)' },
    { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  ],
  languageNote: 'El asistente responderá en este idioma.',
  savingText: 'Guardando…',
  savedText: 'Guardado',
  loadingLabel: 'Cargando preferencias',
  errorTitle: 'No pudimos cargar tus preferencias',
  errorBody: 'Intenta de nuevo en unos segundos.',
  retryLabel: 'Reintentar',
  onRetry: () => {},
  onChange: () => {},
}

function Interactive() {
  const [values, setValues] = useState(base.values)
  return <PreferencesForm {...base} values={values} saveState="saved" onChange={(f, v) => setValues((p) => ({ ...p, [f]: v }))} />
}

const meta = { title: 'Organisms/PreferencesForm', component: PreferencesForm, args: base } satisfies Meta<typeof PreferencesForm>
export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}
export const Saving: Story = { args: { saveState: 'saving' } }
export const Saved: Story = { args: { saveState: 'saved' } }
export const Loading: Story = { args: { state: 'loading' } }
export const Error: Story = { args: { state: 'error' } }
export const Playground: Story = { render: () => <Interactive /> }
