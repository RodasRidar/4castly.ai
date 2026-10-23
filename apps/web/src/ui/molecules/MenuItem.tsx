import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon?: LucideIcon
  danger?: boolean
  disabled?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** Works standalone or as the child of `DropdownMenu.Item asChild` (spreads rest props and forwards ref). */
export function MenuItem({ label, icon, danger, disabled, onClick, className, ref, ...rest }: MenuItemProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }
  return (
    <button
      type="button"
      role="menuitem"
      {...rest}
      ref={ref}
      aria-disabled={disabled || undefined}
      data-danger={danger || undefined}
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-md outline-none',
        'hover:bg-selected focus:bg-selected data-[highlighted]:bg-selected',
        danger ? 'text-critical' : 'text-ink',
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        className,
      )}
    >
      {icon && <Icon icon={icon} />}
      <span className="flex-1">{label}</span>
    </button>
  )
}
