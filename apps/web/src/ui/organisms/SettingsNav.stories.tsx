import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsNav } from './SettingsNav'

const meta = {
  title: 'Organisms/SettingsNav',
  component: SettingsNav,
  args: {
    label: 'Configuración',
    backLabel: 'Volver a la aplicación',
    backHref: '#',
    sections: [
      { id: 'profile', label: 'Perfil', href: '#perfil', current: true },
      { id: 'prefs', label: 'Preferencias', href: '#preferencias' },
    ],
    soonLabel: 'Próximamente',
    soonItems: [
      { id: 'team', label: 'Empresa y equipo' },
      { id: 'sources', label: 'Fuentes de datos' },
      { id: 'notifications', label: 'Notificaciones' },
      { id: 'plan', label: 'Plan y uso' },
    ],
  },
} satisfies Meta<typeof SettingsNav>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const PreferencesCurrent: Story = {
  args: {
    sections: [
      { id: 'profile', label: 'Perfil', href: '#perfil' },
      { id: 'prefs', label: 'Preferencias', href: '#preferencias', current: true },
    ],
  },
}
