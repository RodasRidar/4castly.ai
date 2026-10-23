import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { applyLanguage } from '../i18n'
import { useServices } from '../services/servicesContext'
import type { Preferences } from '../services/ports'
import { useThemeStore } from '../theme/useTheme'
import { useAppEnv } from './envContext'
import { useNotify } from './notifyContext'

export const preferencesKey = ['preferences'] as const

export function usePreferences() {
  const { profile } = useServices()
  return useQuery({ queryKey: preferencesKey, queryFn: () => profile.getPreferences(), staleTime: Infinity })
}

function useApplyPreferences() {
  const { i18n, root } = useAppEnv()
  const themeStore = useThemeStore()
  return useCallback(
    (prefs: Pick<Preferences, 'theme' | 'language'>) => {
      themeStore.setPreference(prefs.theme)
      applyLanguage(i18n, prefs.language, root)
    },
    [themeStore, i18n, root],
  )
}

/** Server preferences win over the device cache as soon as they arrive. */
export function useSyncPreferences() {
  const { data } = usePreferences()
  const apply = useApplyPreferences()
  useEffect(() => {
    if (data) apply(data)
  }, [data, apply])
}

/** Optimistic autosave: the UI changes at once, and a failed save restores the previous values and says so. */
export function useUpdatePreferences() {
  const { profile } = useServices()
  const queryClient = useQueryClient()
  const apply = useApplyPreferences()
  const notify = useNotify()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (patch: Partial<Preferences>) => profile.patchPreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: preferencesKey })
      const previous = queryClient.getQueryData<Preferences>(preferencesKey)
      if (previous) {
        const next = { ...previous, ...patch }
        queryClient.setQueryData(preferencesKey, next)
        apply(next)
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesKey, context.previous)
        apply(context.previous)
      }
      notify('error', t('common.saveError'))
    },
  })
}
