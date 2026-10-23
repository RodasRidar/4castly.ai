import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UserMenu, type UserMenuProps } from './UserMenu'

const props = (over: Partial<UserMenuProps> = {}): UserMenuProps => ({
  user: { name: 'María Pérez', email: 'maria@acme.cl', company: 'Importadora Acme' },
  label: 'Menú de usuario',
  settingsLabel: 'Configuración',
  settingsHref: '/configuracion',
  themeLabel: 'Tema',
  theme: 'system',
  themeOptions: [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Sistema' },
  ],
  onThemeChange: vi.fn(),
  languageLabel: 'Idioma',
  language: 'es',
  languageOptions: [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ],
  onLanguageChange: vi.fn(),
  logoutLabel: 'Cerrar sesión',
  onLogout: vi.fn(),
  ...over,
})

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: /María Pérez/ }))
  return screen.findByRole('dialog', { name: 'Menú de usuario' })
}

describe('UserMenu', () => {
  it('shows identity, settings link, theme, language and logout when opened', async () => {
    render(<UserMenu {...props()} />)
    const dlg = await open()
    expect(within(dlg).getByText('maria@acme.cl')).toBeInTheDocument()
    expect(within(dlg).getByText('Importadora Acme')).toBeInTheDocument()
    expect(within(dlg).getByRole('link', { name: 'Configuración' })).toHaveAttribute('href', '/configuracion')
    expect(within(dlg).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument()
    expect(within(dlg).getByRole('combobox', { name: 'Idioma' })).toHaveValue('es')
    expect(within(dlg).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
  it('reflects the controlled theme and reports changes', async () => {
    const p = props()
    render(<UserMenu {...p} />)
    const dlg = await open()
    expect(within(dlg).getByRole('radio', { name: 'Sistema' })).toBeChecked()
    await userEvent.click(within(dlg).getByRole('radio', { name: 'Oscuro' }))
    expect(p.onThemeChange).toHaveBeenCalledWith('dark')
  })
  it('reports language changes', async () => {
    const p = props()
    render(<UserMenu {...p} />)
    const dlg = await open()
    await userEvent.selectOptions(within(dlg).getByRole('combobox', { name: 'Idioma' }), 'en')
    expect(p.onLanguageChange).toHaveBeenCalledWith('en')
  })
  it('logs out', async () => {
    const p = props()
    render(<UserMenu {...p} />)
    const dlg = await open()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cerrar sesión' }))
    expect(p.onLogout).toHaveBeenCalledOnce()
  })
  it('closes with Escape and returns focus to the trigger', async () => {
    render(<UserMenu {...props()} />)
    const trigger = screen.getByRole('button', { name: /María Pérez/ })
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
  it('compact variant renders an avatar-only trigger with an accessible name', async () => {
    render(<UserMenu {...props({ compact: true, triggerLabel: 'Abrir menú de usuario' })} />)
    expect(screen.queryByText('Importadora Acme')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú de usuario' }))
    expect(await screen.findByRole('dialog', { name: 'Menú de usuario' })).toBeInTheDocument()
  })
})
