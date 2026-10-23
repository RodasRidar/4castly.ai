import { Check, Minus } from 'lucide-react'
import { Checkbox as RadixCheckbox } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

export function Checkbox({ className, ...rest }: ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      {...rest}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-mute bg-elevated',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <RadixCheckbox.Indicator>
        {rest.checked === 'indeterminate' ? <Icon icon={Minus} size="sm" /> : <Icon icon={Check} size="sm" />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
}
