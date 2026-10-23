import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { SettingsNav } from '../ui/organisms/SettingsNav'

export function SettingsLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const sections = [
    { id: 'profile', label: t('settings.profile'), href: '/configuracion/perfil' },
    { id: 'preferences', label: t('settings.preferences'), href: '/configuracion/preferencias' },
  ].map((s) => ({ ...s, current: pathname === s.href }))

  return (
    <div className="flex min-h-dvh flex-col bg-canvas md:flex-row">
      <SettingsNav
        label={t('settings.nav')}
        backLabel={t('settings.back')}
        backHref="/nuevo"
        sections={sections}
        soonLabel={t('settings.soon')}
        soonItems={[
          { id: 'team', label: t('settings.soonItems.team') },
          { id: 'billing', label: t('settings.soonItems.billing') },
        ]}
      />
      <main id="main" className="min-w-0 flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
