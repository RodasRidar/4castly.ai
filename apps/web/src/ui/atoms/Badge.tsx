import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'soon' | 'count'
}

const tones = {
  neutral: 'border border-hairline bg-elevated text-body',
  soon: 'bg-selected text-body',
  count: 'min-w-5 justify-center bg-primary text-primary-fg',
} as const

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      data-tone={tone}
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-body-sm font-medium', tones[tone], className)}
    />
  )
}
