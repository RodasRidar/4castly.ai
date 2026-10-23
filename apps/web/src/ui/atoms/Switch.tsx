import { Switch as RadixSwitch } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export function Switch({ className, ...rest }: ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      {...rest}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-hairline bg-selected p-0.5',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <RadixSwitch.Thumb className="block size-3.5 rounded-full bg-mute transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-fg motion-reduce:transition-none" />
    </RadixSwitch.Root>
  )
}
