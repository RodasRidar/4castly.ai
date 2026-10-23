import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsNav } from './SettingsNav'

const props = {
  label: 'Configuración',
  backLabel: 'Volver a la aplicación',
  backHref: '/',
  sections: [
    { id: 'profile', label: 'Perfil', href: '/configuracion/perfil', current: true },
    { id: 'prefs', label: 'Preferencias', href: '/configuracion/preferencias' },
  ],
  soonLabel: 'Próximamente',
  soonItems: [
    { id: 'team', label: 'Empresa y equipo' },
    { id: 'sources', label: 'Fuentes de datos' },
  ],
}

describe('SettingsNav', () => {
  it('is a named nav landmark with a back link', () => {
    render(<SettingsNav {...props} />)
    const nav = screen.getByRole('navigation', { name: 'Configuración' })
    expect(within(nav).getByRole('link', { name: /Volver a la aplicación/ })).toHaveAttribute('href', '/')
  })
  it('marks only the current section with aria-current', () => {
    render(<SettingsNav {...props} />)
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Preferencias' })).not.toHaveAttribute('aria-current')
  })
  it('renders coming-soon items as disabled, non-link entries with a badge', () => {
    render(<SettingsNav {...props} />)
    expect(screen.queryByRole('link', { name: /Empresa y equipo/ })).not.toBeInTheDocument()
    const item = screen.getByText('Empresa y equipo').closest('li')!
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(within(item).getByText('Próximamente')).toHaveAttribute('data-tone', 'soon')
  })
})
