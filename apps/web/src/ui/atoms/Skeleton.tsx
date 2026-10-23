import { cn } from '../../lib/cn'

interface SkeletonProps {
  shape?: 'line' | 'block' | 'circle'
  className?: string
}

const shapes = {
  line: 'h-3 w-full rounded',
  block: 'h-24 w-full rounded-lg',
  circle: 'size-8 rounded-full',
} as const

export function Skeleton({ shape = 'line', className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      data-shape={shape}
      className={cn('block animate-pulse bg-selected motion-reduce:animate-none', shapes[shape], className)}
    />
  )
}
