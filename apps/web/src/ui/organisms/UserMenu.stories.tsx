import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { UserMenu, type ThemeValue, type UserMenuProps } from './UserMenu'

const base: UserMenuProps = {
  user: { name: 'María Pérez', email: 'maria@importadoraacme.cl', company: 'Importadora Acme' },
  label: 'Menú de usuario',
  triggerLabel: 'Abrir menú de usuario',
  settingsLabel: 'Configuración',
  settingsHref: '#configuracion',
  themeLabel: 'Tema',
  theme: 'system',
  themeOptions: [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Sistema' },
  ],
  onThemeChange: () => {},
  languageLabel: 'Idioma',
  language: 'es',
  languageOptions: [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ],
  onLanguageChange: () => {},
  logoutLabel: 'Cerrar sesión',
  onLogout: () => {},
}

function Stateful({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeValue>('system')
  const [language, setLanguage] = useState('es')
  return (
    <div className="w-64 pt-72">
      <UserMenu {...base} compact={compact} theme={theme} onThemeChange={setTheme} language={language} onLanguageChange={setLanguage} />
    </div>
  )
}

const meta = { title: 'Organisms/UserMenu', component: UserMenu, args: base } satisfies Meta<typeof UserMenu>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: () => <Stateful /> }
export const Compact: Story = { render: () => <Stateful compact /> }
