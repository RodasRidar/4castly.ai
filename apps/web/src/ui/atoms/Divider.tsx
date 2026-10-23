import { cn } from '../../lib/cn'

export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <div role="separator" className={cn('h-px w-full bg-hairline', className)} />
  return (
    <div role="separator" className={cn('flex items-center gap-3 text-body-sm text-mute', className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  )
}
