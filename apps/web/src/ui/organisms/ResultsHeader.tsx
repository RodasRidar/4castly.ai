import { Link2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { TextLink } from '../atoms/TextLink'

export interface BreadcrumbItem {
  label: string
  /** Omit on the last (current) item. */
  href?: string
}

export interface ResultsHeaderProps {
  /** Accessible name of the breadcrumb nav, e.g. "Ruta de navegación". */
  navLabel: string
  /** Ordered items; the last one is the current page. */
  breadcrumb: BreadcrumbItem[]
  /** Text of the secondary share button, e.g. "Compartir enlace". */
  shareLabel: string
  onShare: () => void
  /** Slot for the export menu (built elsewhere). */
  exportMenu?: ReactNode
  className?: string
}

/** Header of the results panel (a plain div on purpose: not a global banner/top bar). */
export function ResultsHeader({ navLabel, breadcrumb, shareLabel, onShare, exportMenu, className }: ResultsHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <nav aria-label={navLabel} className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1.5 text-body-md text-mute">
          {breadcrumb.map((item, i) => {
            const last = i === breadcrumb.length - 1
            return (
              <Fragment key={`${i}-${item.label}`}>
                <li className="min-w-0">
                  {last || !item.href ? (
                    <span aria-current={last ? 'page' : undefined} className={cn('truncate', last && 'font-medium text-ink')}>
                      {item.label}
                    </span>
                  ) : (
                    <TextLink href={item.href} className="text-mute no-underline hover:underline">
                      {item.label}
                    </TextLink>
                  )}
                </li>
                {!last && (
                  <li aria-hidden="true" className="text-faint">
                    /
                  </li>
                )}
              </Fragment>
            )
          })}
        </ol>
      </nav>
      <div className="flex items-center gap-2">
        <Button variant="secondary" iconLeft={<Icon icon={Link2} />} onClick={onShare}>
          {shareLabel}
        </Button>
        {exportMenu}
      </div>
    </div>
  )
}
