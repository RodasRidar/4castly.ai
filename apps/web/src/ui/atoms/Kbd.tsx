import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd {...rest} className={cn('rounded border border-hairline bg-canvas px-1.5 py-0.5 font-mono text-body-sm text-body', className)} />
}
