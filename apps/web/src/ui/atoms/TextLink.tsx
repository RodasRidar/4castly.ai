import type { AnchorHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  external?: boolean
}

export function TextLink({ external, className, children, ...rest }: TextLinkProps) {
  return (
    <a
      {...rest}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={cn('text-ink underline decoration-1 underline-offset-[3px] hover:decoration-2', className)}
    >
      {children}
    </a>
  )
}
