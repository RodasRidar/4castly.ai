import { cn } from '../../lib/cn'

export interface ProgressCountProps {
  /** Accessible name of the progress bar. */
  label: string
  /** Human count such as "87 de 142 productos". Never a percentage. */
  countText?: string
  className?: string
}

export function ProgressCount({ label, countText, className }: ProgressCountProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div role="progressbar" aria-label={label} className="relative h-1.5 w-full overflow-hidden rounded-full bg-selected">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
      </div>
      {countText && <p className="text-body-sm text-mute">{countText}</p>}
    </div>
  )
}
