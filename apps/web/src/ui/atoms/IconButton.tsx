import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { Tooltip } from 'radix-ui'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Required: accessible name and tooltip text. */
  label: string
  icon: LucideIcon
  variant?: 'ghost' | 'outline'
  size?: 'sm' | 'md'
}

export function IconButton({ label, icon, variant = 'ghost', size = 'md', type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            {...rest}
            type={type}
            aria-label={label}
            data-variant={variant}
            className={cn(
              'inline-flex items-center justify-center rounded-md text-body',
              'hover:bg-selected hover:text-ink disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'size-7' : 'size-9',
              variant === 'outline' && 'border border-hairline bg-elevated',
              className,
            )}
          >
            <Icon icon={icon} size={size === 'sm' ? 'sm' : 'md'} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 rounded-md bg-primary px-2 py-1 text-body-sm text-primary-fg shadow-popover"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
