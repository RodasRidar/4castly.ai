import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorTextOf } from '../app/errorText'
import { useNotify } from '../app/notifyContext'
import { useServices } from '../services/servicesContext'
import { conversationsKey } from './keys'

const UNDO_MS = 8000

/** Soft delete with an undo toast (R12): the API keeps the conversation for 30 days, so undo is `restore`. */
export function useDeleteConversation(onDeleted?: (id: string) => void) {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsKey })

  const restore = async (id: string) => {
    try {
      await conversations.restore(id)
    } catch (error) {
      notify('error', errorTextOf(t, error))
    }
    await refresh()
  }

  return useMutation({
    mutationFn: (id: string) => conversations.remove(id).then(() => id),
    onSuccess: (id) => {
      onDeleted?.(id)
      notify('info', t('conversations.deleted'), {
        duration: UNDO_MS,
        action: { label: t('conversations.undo'), onAction: () => void restore(id) },
      })
    },
    onError: (error) => notify('error', errorTextOf(t, error)),
    onSettled: refresh,
  })
}
