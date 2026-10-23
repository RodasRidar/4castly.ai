import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '../../lib/cn'
import { IconButton } from '../atoms/IconButton'
import { Input, type InputProps } from '../atoms/Input'

export interface SearchFieldProps extends Omit<InputProps, 'value' | 'onChange' | 'leadingIcon' | 'type'> {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name of the clear button. */
  clearLabel: string
}

export function SearchField({ value, onValueChange, clearLabel, className, onKeyDown, ...rest }: SearchFieldProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const clear = () => {
    onValueChange('')
    wrapper.current?.querySelector('input')?.focus()
  }
  return (
    <div ref={wrapper} className="relative">
      <Input
        {...rest}
        leadingIcon={Search}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            clear()
          }
        }}
        className={cn(value && 'pr-10', className)}
      />
      {value && (
        <IconButton size="sm" variant="ghost" label={clearLabel} icon={X} onClick={clear} className="absolute top-1/2 right-1 -translate-y-1/2" />
      )}
    </div>
  )
}
