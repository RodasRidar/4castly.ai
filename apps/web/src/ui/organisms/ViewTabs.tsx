import { Tabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface ViewTab {
  value: string
  label: string
}

export interface ViewTabsProps {
  tabs: ViewTab[]
  value: string
  /** The container binds this to the `?vista=` search param. */
  onValueChange: (value: string) => void
  'aria-label': string
  /** Optional panel per tab value; only the active one renders. */
  panels?: Record<string, ReactNode>
  className?: string
}

export function ViewTabs({ tabs, value, onValueChange, panels, className, ...rest }: ViewTabsProps) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={cn('flex flex-col gap-4', className)}>
      <Tabs.List aria-label={rest['aria-label']} className="flex gap-4 border-b border-hairline">
        {tabs.map((t) => (
          <Tabs.Trigger
            key={t.value}
            value={t.value}
            // Without panels there is nothing to point at; Radix would otherwise reference a missing id.
            {...(panels ? {} : { 'aria-controls': undefined })}
            className={cn(
              '-mb-px border-b-2 border-transparent px-1 pb-2 text-body-md text-mute hover:text-ink',
              'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
            )}
          >
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {panels &&
        tabs.map((t) => (
          <Tabs.Content key={t.value} value={t.value}>
            {panels[t.value]}
          </Tabs.Content>
        ))}
    </Tabs.Root>
  )
}
