import { Clock, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export type NoticeTone = 'info' | 'warning' | 'staleness'

export interface InlineNoticeProps {
  tone: NoticeTone
  title?: string
  children: ReactNode
  className?: string
}

const tones = {
  info: { icon: Info, box: 'border-hairline bg-elevated text-body' },
  staleness: { icon: Clock, box: 'border-hairline bg-selected text-body' },
  warning: { icon: TriangleAlert, box: 'border-medium-border bg-medium-bg text-medium' },
} as const

export function InlineNotice({ tone, title, children, className }: InlineNoticeProps) {
  const t = tones[tone]
  return (
    <div
      role={tone === 'warning' ? 'status' : 'note'}
      data-tone={tone}
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-body-md', t.box, className)}
    >
      <Icon icon={t.icon} className="mt-0.5" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}
