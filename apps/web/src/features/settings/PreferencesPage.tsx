import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../../i18n'
import { usePreferences, useUpdatePreferences } from '../../app/preferences'
import { PreferencesForm, type PreferencesValues } from '../../ui/organisms/PreferencesForm'

const TIMEZONES = ['America/Lima', 'America/Bogota', 'America/Santiago', 'America/Mexico_City', 'UTC']

/** Autosave form wired to the same store and mutation as the user menu, so both always agree. */
export function PreferencesPage() {
  const { t } = useTranslation()
  const prefs = usePreferences()
  const update = useUpdatePreferences()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-lg font-semibold text-ink">{t('settings.preferencesTitle')}</h1>
      <PreferencesForm
        label={t('settings.preferencesForm')}
        values={prefs.data ?? { theme: 'system', language: 'es', timezone: 'UTC' }}
        fieldLabels={{ theme: t('settings.fields.theme'), language: t('settings.fields.language'), timezone: t('settings.fields.timezone') }}
        themeOptions={(['light', 'dark', 'system'] as const).map((value) => ({ value, label: t(`theme.${value}`) }))}
        languageOptions={LANGUAGES.map((value) => ({ value, label: t(`language.${value}`) }))}
        timezoneOptions={TIMEZONES.map((value) => ({ value, label: t(`timezones.${value}`) }))}
        languageNote={t('settings.languageNote')}
        onChange={(field: keyof PreferencesValues, value: string) => update.mutate({ [field]: value })}
        saveState={update.isPending ? 'saving' : update.isSuccess ? 'saved' : 'idle'}
        savingText={t('settings.saving')}
        savedText={t('settings.saved')}
        state={prefs.isPending ? 'loading' : prefs.isError ? 'error' : 'ready'}
        loadingLabel={t('common.loading')}
        errorTitle={t('settings.errorTitle')}
        errorBody={t('settings.errorBody')}
        retryLabel={t('common.retry')}
        onRetry={() => void prefs.refetch()}
      />
    </div>
  )
}
