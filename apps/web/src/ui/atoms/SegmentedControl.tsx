import { RadioGroup } from 'radix-ui'
import { cn } from '../../lib/cn'

interface SegmentedControlProps {
  options: { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  'aria-label': string
  className?: string
}

export function SegmentedControl({ options, value, onValueChange, className, ...rest }: SegmentedControlProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={rest['aria-label']}
      orientation="horizontal"
      className={cn('inline-flex rounded-md border border-hairline bg-canvas p-0.5', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'rounded px-3 py-1 text-body-md text-body',
            'data-[state=checked]:bg-elevated data-[state=checked]:font-medium data-[state=checked]:text-ink',
            'data-[state=checked]:shadow-[0_0_0_1px_var(--hairline)]',
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
