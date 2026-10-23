import { ArrowDown, MessageSquare } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Divider } from '../atoms/Divider'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { EmptyState } from '../molecules/EmptyState'
import { ErrorState } from '../molecules/ErrorState'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

export type ChatThreadMessage = ChatMessageProps & {
  id: string
  /** Renders a labelled date divider before this message (e.g. "Hoy"). */
  dividerLabel?: string
}

export interface ChatThreadProps {
  /** Accessible name of the log region. */
  label: string
  /** Accessible name of the "jump to latest" button. */
  jumpLabel: string
  messages: ChatThreadMessage[]
  state?: 'ready' | 'loading' | 'error'
  loadingLabel: string
  emptyTitle: string
  emptyBody: string
  errorTitle: string
  errorBody: string
  retryLabel: string
  onRetry?: () => void
  className?: string
}

/** Within this many pixels of the bottom counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 24

export function ChatThread({
  label,
  jumpLabel,
  messages,
  state = 'ready',
  loadingLabel,
  emptyTitle,
  emptyBody,
  errorTitle,
  errorBody,
  retryLabel,
  onRetry,
  className,
}: ChatThreadProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [behind, setBehind] = useState(false)

  const toBottom = () => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
    following.current = atBottom
    if (atBottom) setBehind(false)
  }

  useLayoutEffect(() => {
    if (following.current) toBottom()
  }, [messages])

  useEffect(() => {
    if (!following.current && messages.length > 0) setBehind(true)
  }, [messages])

  if (state === 'loading') {
    return (
      <div role="status" aria-label={loadingLabel} aria-busy="true" className={cn('flex flex-col gap-4 p-4', className)}>
        <Skeleton className="ml-auto h-9 w-2/3" />
        <Skeleton className="h-16" />
        <VisuallyHidden>{loadingLabel}</VisuallyHidden>
      </div>
    )
  }
  if (state === 'error') {
    return (
      <ErrorState
        className={className}
        title={errorTitle}
        body={errorBody}
        primaryAction={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        }
      />
    )
  }
  if (messages.length === 0) {
    return <EmptyState className={className} icon={MessageSquare} title={emptyTitle} body={emptyBody} />
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <div ref={logRef} role="log" aria-label={label} aria-live="off" onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.map(({ id, dividerLabel, ...message }) => (
          <div key={id} className="flex flex-col gap-4">
            {dividerLabel && <Divider label={dividerLabel} />}
            <ChatMessage {...message} />
          </div>
        ))}
      </div>
      {behind && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<ArrowDown width={14} height={14} aria-hidden="true" />}
            className="shadow-popover"
            onClick={() => {
              following.current = true
              setBehind(false)
              toBottom()
            }}
          >
            {jumpLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
