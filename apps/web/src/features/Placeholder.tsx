import type { LucideIcon } from 'lucide-react'
import { Icon } from '../ui/atoms/Icon'

/** Stand-in for screens that arrive in F4-F6. Keeps the page structure (one h1) right already. */
export function Placeholder({ icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <section className="flex flex-col gap-3 p-6">
      <span className="text-mute">
        <Icon icon={icon} />
      </span>
      <h1 className="text-heading-lg font-semibold text-ink">{title}</h1>
      <p className="max-w-prose text-body-md text-body">{body}</p>
    </section>
  )
}
