import { ArchiveRestore, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '../../services/types'
import { Badge } from '../../ui/atoms/Badge'
import { IconButton } from '../../ui/atoms/IconButton'
import { StatusDot } from '../../ui/atoms/StatusDot'
import { formatActivity } from './relativeTime'

const PROCESSING: Conversation['stage'][] = ['queued', 'uploaded', 'digesting', 'calculating']
const FAILED: Conversation['stage'][] = ['failed', 'unreadable']

interface HistoryRowProps {
  conversation: Conversation
  onUnarchive: () => void
  onDelete: () => void
}

/** One conversation: link, file, stage in words, last activity and the actions that make sense for it. */
export function HistoryRow({ conversation: c, onUnarchive, onDelete }: HistoryRowProps) {
  const { t, i18n } = useTranslation()
  const stage = t(`history.stage.${c.stage}`)
  return (
    <li className="flex items-center gap-3 rounded-lg border border-hairline bg-elevated px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <a href={`/c/${c.id}`} className="truncate text-body-lg font-medium text-ink underline-offset-[3px] hover:underline">
            {c.title}
          </a>
          {c.archived && <Badge>{t('history.archived')}</Badge>}
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-mute">
          {c.file_name && <span className="truncate font-mono">{c.file_name}</span>}
          <span className="inline-flex items-center gap-1.5">
            {PROCESSING.includes(c.stage) && <StatusDot status="processing" label={stage} />}
            {FAILED.includes(c.stage) && <StatusDot status="failed" label={stage} />}
            <span>{stage}</span>
          </span>
          <span>{formatActivity(c.last_activity_at, i18n.language)}</span>
        </p>
      </div>
      {c.archived && (
        <IconButton label={t('history.unarchive', { title: c.title })} icon={ArchiveRestore} variant="outline" onClick={onUnarchive} />
      )}
      <IconButton label={t('history.delete', { title: c.title })} icon={Trash2} variant="outline" onClick={onDelete} />
    </li>
  )
}
