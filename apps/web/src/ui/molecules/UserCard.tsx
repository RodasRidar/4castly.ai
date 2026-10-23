import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../../lib/cn'
import { Avatar } from '../atoms/Avatar'

export interface UserCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  name: string
  company: string
  ref?: Ref<HTMLButtonElement>
}

/** Menu trigger: spreads all button props so Radix `Trigger asChild` can attach aria-haspopup/expanded. */
export function UserCard({ name, company, type = 'button', className, ref, ...rest }: UserCardProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-selected', className)}
    >
      <span aria-hidden="true">
        <Avatar name={name} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-md font-medium text-ink">{name}</span>{' '}
        <span className="truncate text-body-sm text-mute">{company}</span>
      </span>
    </button>
  )
}
