import { cn } from '../../lib/cn'
import { Spinner } from '../atoms/Spinner'

export interface ToolStatusLineProps {
  /** Human text such as "Consultando el stock de Glicerina…". */
  text: string
  className?: string
}

export function ToolStatusLine({ text, className }: ToolStatusLineProps) {
  return (
    <div role="status" className={cn('flex items-center gap-2 text-body-sm text-mute', className)}>
      <Spinner decorative size="sm" />
      <span>{text}</span>
    </div>
  )
}
