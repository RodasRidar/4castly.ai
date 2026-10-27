import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorTextOf } from '../../app/errorText'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import { conversationKey } from '../conversation/useConversationData'
import { clearPendingLeadTimes } from './pendingOverrides'
import { runKey } from './queries'

/** Starts a new calculation: it applies saved parameters and per-product overrides, and the conversation goes back to `calculating`. */
export function useRecalculate(runId: string, conversationId: string) {
  const { runs } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: () => runs.recalculate(runId),
    onSuccess: async () => {
      // The calculation will apply the saved lead times; they show up in the rows when it finishes.
      clearPendingLeadTimes(queryClient, runId)
      await queryClient.invalidateQueries({ queryKey: runKey(runId) })
      await queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
    },
    onError: (error) => notify('error', errorTextOf(t, error)),
  })
}
