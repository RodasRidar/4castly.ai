import { cn } from '../../lib/cn'
import { initialsOf } from './initials'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'size-6 text-body-sm', md: 'size-8 text-body-sm', lg: 'size-12 text-body-lg' } as const

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      data-size={size}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-selected font-medium text-ink', sizes[size], className)}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  )
}
