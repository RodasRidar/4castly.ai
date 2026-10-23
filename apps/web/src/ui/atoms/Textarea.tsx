import { useLayoutEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const LINE_HEIGHT_PX = 20

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number
  invalid?: boolean
}

export function Textarea({ maxRows = 6, invalid, className, onInput, style, ...rest }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(fit, [rest.value])

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      aria-invalid={invalid || undefined}
      onInput={(e) => {
        fit()
        onInput?.(e)
      }}
      style={{ ...style, maxHeight: `${maxRows * LINE_HEIGHT_PX}px` }}
      className={cn(
        'w-full resize-none overflow-y-auto rounded-md border bg-elevated px-3 py-2 text-body-md leading-5 text-ink',
        'placeholder:text-mute disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-critical' : 'border-hairline',
        className,
      )}
    />
  )
}
