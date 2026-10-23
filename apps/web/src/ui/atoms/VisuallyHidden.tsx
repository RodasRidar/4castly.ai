import type { HTMLAttributes } from 'react'

export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className="absolute -m-px size-px overflow-hidden border-0 p-0 whitespace-nowrap [clip-path:inset(50%)]" />
}
