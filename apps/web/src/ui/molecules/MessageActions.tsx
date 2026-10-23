import { Copy, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from '../atoms/IconButton'

export interface MessageActionsProps {
  /** Accessible name of the whole group. */
  label: string
  copyLabel: string
  /** Accessible name of the retry button; the button is omitted when `onRetry` is not given. */
  retryLabel?: string
  likeLabel: string
  dislikeLabel: string
  liked?: boolean
  disliked?: boolean
  onCopy: () => void
  onRetry?: () => void
  onLike: () => void
  onDislike: () => void
  className?: string
}

export function MessageActions({
  label,
  copyLabel,
  retryLabel,
  likeLabel,
  dislikeLabel,
  liked = false,
  disliked = false,
  onCopy,
  onRetry,
  onLike,
  onDislike,
  className,
}: MessageActionsProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-1', className)}>
      <IconButton size="sm" label={copyLabel} icon={Copy} onClick={onCopy} />
      {onRetry && retryLabel && <IconButton size="sm" label={retryLabel} icon={RefreshCw} onClick={onRetry} />}
      <IconButton size="sm" label={likeLabel} icon={ThumbsUp} aria-pressed={liked} onClick={onLike} className={cn(liked && 'bg-selected text-ink')} />
      <IconButton
        size="sm"
        label={dislikeLabel}
        icon={ThumbsDown}
        aria-pressed={disliked}
        onClick={onDislike}
        className={cn(disliked && 'bg-selected text-ink')}
      />
    </div>
  )
}
