import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { useRunSummary } from './queries'

/** Stale results and the defaults used when the clarification questions were skipped (F4 requirement). */
export function Notices({ runId, onChangeParameters }: { runId: string; onChangeParameters: () => void }) {
  const { t, i18n } = useTranslation()
  const run = useRunSummary(runId).data?.run
  if (!run) return null

  const items = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
    run.defaults_used.map((key) => t(`results.notices.defaultItems.${key}`)),
  )

  return (
    <div className="flex flex-col gap-2">
      {run.stale && <InlineNotice tone="staleness">{t('results.notices.stale')}</InlineNotice>}
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
