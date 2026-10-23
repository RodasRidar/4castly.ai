import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Skeleton } from '../atoms/Skeleton'
import { TextLink } from '../atoms/TextLink'
import { VisuallyHidden } from '../atoms/VisuallyHidden'

export interface KpiCardProps {
  label: string
  /** The value or range, usually a `NumberValue`. */
  value?: ReactNode
  caption?: string
  linkLabel?: string
  href?: string
  state?: 'default' | 'loading' | 'empty'
  /** Screen-reader text while loading. */
  loadingLabel?: string
  className?: string
}

export function KpiCard({ label, value, caption, linkLabel, href, state = 'default', loadingLabel, className }: KpiCardProps) {
  const labelId = useId()
  return (
    <section
      role="group"
      aria-labelledby={labelId}
      aria-busy={state === 'loading' || undefined}
      className={cn('flex flex-col gap-2 rounded-lg border border-hairline bg-elevated p-4', className)}
    >
      <h3 id={labelId} className="text-body-md text-mute">
        {label}
      </h3>
      {state === 'loading' ? (
        <>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="w-2/3" />
          {loadingLabel && <VisuallyHidden>{loadingLabel}</VisuallyHidden>}
        </>
      ) : (
        <>
          <div className="text-heading-md text-ink">{state === 'empty' ? <span className="font-mono text-mute">—</span> : value}</div>
          {caption && <p className="text-body-sm text-mute">{caption}</p>}
          {linkLabel && href && (
            <TextLink href={href} className="text-body-sm">
              {linkLabel}
            </TextLink>
          )}
        </>
      )}
    </section>
  )
}
