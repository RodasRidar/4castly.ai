import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button } from '../atoms/Button'
import { UserMenu } from './UserMenu'
import { Sidebar, type SidebarProps } from './Sidebar'

const menuProps = {
  user: { name: 'María Pérez', email: 'maria@importadoraacme.cl', company: 'Importadora Acme' },
  label: 'Menú de usuario',
  triggerLabel: 'Abrir menú de usuario',
  settingsLabel: 'Configuración',
  settingsHref: '#configuracion',
  themeLabel: 'Tema',
  theme: 'system' as const,
  themeOptions: [
    { value: 'light' as const, label: 'Claro' },
    { value: 'dark' as const, label: 'Oscuro' },
    { value: 'system' as const, label: 'Sistema' },
  ],
  onThemeChange: () => {},
  languageLabel: 'Idioma',
  language: 'es',
  languageOptions: [{ value: 'es', label: 'Español' }],
  onLanguageChange: () => {},
  logoutLabel: 'Cerrar sesión',
  onLogout: () => {},
}

const base: SidebarProps = {
  label: 'Navegación principal',
  collapseLabel: 'Contraer barra lateral',
  expandLabel: 'Expandir barra lateral',
  onToggleCollapsed: () => {},
  newLabel: 'Nuevo forecast',
  onNew: () => {},
  historyLabel: 'Ver todo el historial',
  historyHref: '#historial',
  footer: <UserMenu {...menuProps} />,
  list: {
    label: 'Conversaciones',
    loadingLabel: 'Cargando conversaciones',
    emptyTitle: 'Aún no hay conversaciones',
    emptyBody: 'Sube un Kardex para crear tu primer forecast.',
    errorTitle: 'No pudimos cargar tus conversaciones',
    errorBody: 'Intenta de nuevo.',
    retryLabel: 'Reintentar',
    pinnedLabel: 'Fijada',
    processingLabel: 'Calculando',
    failedLabel: 'Falló',
    renameLabel: 'Renombrar conversación',
    groups: [
      { id: 'pinned', title: 'Fijados', items: [{ id: '1', title: 'Ácido cítrico 25 kg', href: '#1', pinned: true }] },
      { id: 'today', title: 'Hoy', items: [{ id: '2', title: 'Glicerina USP', href: '#2', active: true }, { id: '3', title: 'Sorbitol 70 %', href: '#3', status: 'processing' }] },
      { id: 'older', title: 'Antes', items: [{ id: '4', title: 'Benzoato de sodio', href: '#4', status: 'failed' }] },
    ],
  },
}

function Toggleable() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="h-screen">
      <Sidebar {...base} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} footer={<UserMenu {...menuProps} compact={collapsed} />} />
    </div>
  )
}

function MobileDemo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-4">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Abrir menú
      </Button>
      <Sidebar {...base} mobile={{ open, onOpenChange: setOpen, title: 'Menú', closeLabel: 'Cerrar' }} />
    </div>
  )
}

const meta = {
  title: 'Organisms/Sidebar',
  component: Sidebar,
  args: base,
  decorators: [(Story) => <div className="h-screen"><Story /></div>],
} satisfies Meta<typeof Sidebar>
export default meta
type Story = StoryObj<typeof meta>

export const Expanded: Story = {}
export const Collapsed: Story = { args: { collapsed: true, footer: <UserMenu {...menuProps} compact /> } }
export const Loading: Story = { args: { list: { ...base.list, state: 'loading', groups: [] } } }
export const Empty: Story = { args: { list: { ...base.list, groups: [] } } }
export const Error: Story = { args: { list: { ...base.list, state: 'error', groups: [] } } }
export const Interactive: Story = { render: () => <Toggleable /> }
export const Mobile: Story = { render: () => <MobileDemo />, parameters: { viewport: { defaultViewport: 'mobile1' } } }
