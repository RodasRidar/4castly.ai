import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesForm, type PreferencesFormProps } from './PreferencesForm'

const props = (over: Partial<PreferencesFormProps> = {}): PreferencesFormProps => ({
  label: 'Preferencias',
  values: { theme: 'light', language: 'es', timezone: 'America/Santiago' },
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
  ],
  languageNote: 'El asistente responderá en este idioma.',
  onChange: vi.fn(),
  ...over,
})

describe('PreferencesForm', () => {
  it('renders the three preferences with their values', () => {
    render(<PreferencesForm {...props()} />)
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveValue('es')
    expect(screen.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('America/Santiago')
  })
  it('links the assistant-language note to the language select', () => {
    render(<PreferencesForm {...props()} />)
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveAccessibleDescription('El asistente responderá en este idioma.')
  })
  it('autosaves: each change calls onChange with field and value', async () => {
    const p = props()
    render(<PreferencesForm {...p} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(p.onChange).toHaveBeenLastCalledWith('theme', 'dark')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en')
    expect(p.onChange).toHaveBeenLastCalledWith('language', 'en')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona horaria' }), 'America/Lima')
    expect(p.onChange).toHaveBeenLastCalledWith('timezone', 'America/Lima')
  })
  it.each([
    ['saving', 'Guardando…'],
    ['saved', 'Guardado'],
  ] as const)('shows the %s indicator in a status region', (saveState, text) => {
    render(<PreferencesForm {...props({ saveState, savingText: 'Guardando…', savedText: 'Guardado' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })
  it('idle: status region is empty', () => {
    render(<PreferencesForm {...props({ saveState: 'idle', savingText: 'Guardando…', savedText: 'Guardado' })} />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
  it('loading: skeleton, no controls', () => {
    render(<PreferencesForm {...props({ state: 'loading', loadingLabel: 'Cargando preferencias' })} />)
    expect(screen.getByRole('status', { name: 'Cargando preferencias' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('error: error state with retry', async () => {
    const onRetry = vi.fn()
    render(<PreferencesForm {...props({ state: 'error', errorTitle: 'No pudimos cargar tus preferencias', errorBody: 'Intenta de nuevo.', retryLabel: 'Reintentar', onRetry })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
