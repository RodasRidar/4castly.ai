import { ArrowLeft } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Badge } from '../atoms/Badge'
import { Icon } from '../atoms/Icon'

export interface SettingsNavSection {
  id: string
  label: string
  href: string
  current?: boolean
}

export interface SettingsNavProps {
  /** Accessible name of the nav landmark. */
  label: string
  backLabel: string
  backHref: string
  sections: SettingsNavSection[]
  /** Text of the "coming soon" badge. */
  soonLabel: string
  soonItems: { id: string; label: string }[]
  className?: string
}

export function SettingsNav({ label, backLabel, backHref, sections, soonLabel, soonItems, className }: SettingsNavProps) {
  return (
    <nav aria-label={label} className={cn('flex w-full flex-col gap-4 md:w-60', className)}>
      <a href={backHref} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-md text-body hover:bg-selected hover:text-ink">
        <Icon icon={ArrowLeft} />
        {backLabel}
      </a>
      <ul className="flex flex-col gap-0.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={s.href}
              aria-current={s.current ? 'page' : undefined}
              className={cn(
                'block rounded-md px-2 py-1.5 text-body-md',
                s.current ? 'bg-selected font-medium text-ink' : 'text-body hover:bg-selected hover:text-ink',
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-0.5">
        {soonItems.map((s) => (
          <li key={s.id} aria-disabled="true" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-body-md text-mute">
            <span>{s.label}</span>
            <Badge tone="soon">{soonLabel}</Badge>
          </li>
        ))}
      </ul>
    </nav>
  )
}
