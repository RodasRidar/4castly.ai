import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { usePendingLeadTimes } from './pendingOverrides'
import { useRunSummary } from './queries'
import { useRecalculate } from './useRecalculate'

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
  const summary = useRunSummary(runId).data
  const pendingCount = Object.keys(usePendingLeadTimes(runId)).length
  const recalculate = useRecalculate(runId, conversationId)
  if (!summary) return null
  const { run } = summary

  const items = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
    run.defaults_used.map((key) => t(`results.notices.defaultItems.${key}`)),
  )

  return (
    <div className="flex flex-col gap-2">
      {!summary.stock_known && <InlineNotice tone="warning">{t('results.notices.noStock')}</InlineNotice>}
      {run.parameters_pending || pendingCount > 0 ? (
        <InlineNotice tone="staleness">
          <span className="flex flex-wrap items-center gap-3">
            <span>
              {run.parameters_pending
                ? t(pendingCount > 0 ? 'results.notices.pendingBoth' : 'results.notices.pending')
                : t('results.notices.pendingLeadTimes', { count: pendingCount })}
            </span>
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
