import { useTranslation } from 'react-i18next'
import { LANGUAGES, isLanguage } from '../i18n'
import { usePreferences, useUpdatePreferences } from '../app/preferences'
import { useSession, useSignOut } from '../app/session'
import { useTheme } from '../theme/useTheme'
import { UserMenu, type ThemeValue } from '../ui/organisms/UserMenu'

export function ConnectedUserMenu({ compact }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const { data: user } = useSession()
  const { data: prefs } = usePreferences()
  const { preference } = useTheme()
  const update = useUpdatePreferences()
  const signOut = useSignOut()
  if (!user) return null

  const themes: ThemeValue[] = ['light', 'dark', 'system']
  return (
    <UserMenu
      user={{ name: user.full_name, email: user.email, company: user.company.name }}
      label={t('user.menu')}
      compact={compact}
      triggerLabel={t('user.openMenu')}
      settingsLabel={t('user.settings')}
      settingsHref="/configuracion/perfil"
      themeLabel={t('user.theme')}
      theme={preference}
      themeOptions={themes.map((value) => ({ value, label: t(`theme.${value}`) }))}
      onThemeChange={(theme) => update.mutate({ theme })}
      languageLabel={t('user.language')}
      language={prefs?.locale ?? i18n.language}
      languageOptions={LANGUAGES.map((value) => ({ value, label: t(`language.${value}`) }))}
      onLanguageChange={(language) => {
        if (isLanguage(language)) update.mutate({ locale: language })
      }}
      logoutLabel={t('user.logout')}
      onLogout={() => void signOut()}
    />
  )
}
