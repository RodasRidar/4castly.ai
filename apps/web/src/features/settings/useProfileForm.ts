import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker } from 'react-router'
import { useNotify } from '../../app/notifyContext'
import { sessionKey } from '../../app/session'
import { useServices } from '../../services/servicesContext'
import { ApiFailure, type User } from '../../services/types'

type Field = 'name' | 'role'

const API_FIELD: Record<string, Field> = { full_name: 'name', job_title: 'role' }

/** Edits live beside the saved user, so "dirty" is a comparison and discarding is just dropping the edits. */
export function useProfileForm(user: User) {
  const { t } = useTranslation()
  const { profile } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const [edits, setEdits] = useState<Partial<Record<Field, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [justSaved, setJustSaved] = useState(false)

  const values = { name: edits.name ?? user.full_name, role: edits.role ?? user.job_title ?? '' }
  const dirty = values.name !== user.full_name || values.role !== (user.job_title ?? '')

  const save = useMutation({
    mutationFn: () => profile.updateMe({ full_name: values.name.trim(), job_title: values.role.trim() || null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(sessionKey, updated)
      setEdits({})
      setErrors({})
      setJustSaved(true)
      notify('success', t('settings.profileSaved'))
    },
    onError: (error) => {
      const issues = error instanceof ApiFailure ? (error.problem.fields ?? []) : []
      const mapped: Partial<Record<Field, string>> = {}
      for (const issue of issues) {
        const field = API_FIELD[issue.field]
        if (field) mapped[field] = t(`settings.profileErrors.${issue.code}`, { defaultValue: t('settings.profileErrors.invalid') })
      }
      if (Object.keys(mapped).length > 0) setErrors(mapped)
      else notify('error', t('settings.profileSaveError'))
    },
  })

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return {
    values,
    errors,
    status: save.isPending ? ('saving' as const) : dirty ? ('dirty' as const) : justSaved ? ('saved' as const) : ('pristine' as const),
    change(field: Field, value: string) {
      setEdits((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: undefined }))
      setJustSaved(false)
    },
    submit() {
      if (!values.name.trim()) {
        setErrors({ name: t('settings.profileErrors.required') })
        return
      }
      save.mutate()
    },
    discard() {
      setEdits({})
      setErrors({})
    },
    leave: {
      open: blocker.state === 'blocked',
      stay: () => blocker.state === 'blocked' && blocker.reset(),
      confirm: () => blocker.state === 'blocked' && blocker.proceed(),
    },
  }
}
