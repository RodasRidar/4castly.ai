import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

const sizes = { sm: 14, md: 16, lg: 20 } as const
export type IconSize = keyof typeof sizes

interface IconProps {
  icon: LucideIcon
  size?: IconSize
  /** Provide only when the icon carries meaning on its own; otherwise it is decorative. */
  label?: string
  className?: string
}

export function Icon({ icon: Glyph, size = 'md', label, className }: IconProps) {
  const px = sizes[size]
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={1.75}
      className={cn('shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  )
}
