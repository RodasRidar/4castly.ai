import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorTextOf } from '../../app/errorText'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { conversationKey } from '../conversation/useConversationData'
import { runKey, useRunSummary } from './queries'

interface NoticesProps {
  runId: string
  conversationId: string
  onChangeParameters: () => void
}

/**
 * What the user should know before trusting the numbers: no stock column (indicative results), parameters
 * saved but not applied yet, stale results, and the defaults used when the questions were skipped.
 */
export function Notices({ runId, conversationId, onChangeParameters }: NoticesProps) {
  const { t, i18n } = useTranslation()
  const { runs } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const summary = useRunSummary(runId).data
  const recalculate = useMutation({
    mutationFn: () => runs.recalculate(runId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runKey(runId) })
      await queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
    },
    onError: (error) => notify('error', errorTextOf(t, error)),
  })
  if (!summary) return null
  const { run } = summary

  const items = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
    run.defaults_used.map((key) => t(`results.notices.defaultItems.${key}`)),
  )

  return (
    <div className="flex flex-col gap-2">
      {!summary.stock_known && <InlineNotice tone="warning">{t('results.notices.noStock')}</InlineNotice>}
      {run.parameters_pending ? (
        <InlineNotice tone="staleness">
          <span className="flex flex-wrap items-center gap-3">
            <span>{t('results.notices.pending')}</span>
            <Button variant="secondary" size="sm" loading={recalculate.isPending} onClick={() => recalculate.mutate()}>
              {t('results.notices.recalculate')}
            </Button>
          </span>
        </InlineNotice>
      ) : (
        run.stale && <InlineNotice tone="staleness">{t('results.notices.stale')}</InlineNotice>
      )}
      {run.defaults_used.length > 0 && (
        <InlineNotice tone="info">
          <span className="flex flex-wrap items-center gap-3">
            <span>{t('results.notices.defaults', { items })}</span>
            <Button variant="secondary" size="sm" onClick={onChangeParameters}>
              {t('results.notices.change')}
            </Button>
          </span>
        </InlineNotice>
      )}
    </div>
  )
}
