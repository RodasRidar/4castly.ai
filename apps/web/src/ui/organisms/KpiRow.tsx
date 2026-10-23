import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { ErrorState } from '../molecules/ErrorState'
import { KpiCard } from '../molecules/KpiCard'

export interface KpiRowItem {
  id: string
  label: string
  value?: ReactNode
  caption?: string
  linkLabel?: string
  href?: string
}

export interface KpiRowProps {
  state: 'loading' | 'empty' | 'populated' | 'error'
  /** The three KPIs: at risk, average coverage, reliability. */
  items: KpiRowItem[]
  /** Accessible name of the group of indicators. */
  label: string
  /** Screen-reader text while loading. */
  loadingLabel: string
  error?: { title: string; body: string; action?: ReactNode }
  className?: string
}

export function KpiRow({ state, items, label, loadingLabel, error, className }: KpiRowProps) {
  if (state === 'error') {
    return (
      <div className={cn('rounded-lg border border-hairline bg-elevated', className)}>
        <ErrorState title={error?.title ?? ''} body={error?.body ?? ''} primaryAction={error?.action} />
      </div>
    )
  }
  return (
    <div role="group" aria-label={label} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <KpiCard
          key={item.id}
          label={item.label}
          value={item.value}
          caption={item.caption}
          linkLabel={item.linkLabel}
          href={item.href}
          state={state === 'loading' ? 'loading' : state === 'empty' ? 'empty' : 'default'}
          loadingLabel={loadingLabel}
        />
      ))}
    </div>
  )
}
