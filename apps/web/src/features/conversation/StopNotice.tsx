import type { ReactNode } from 'react'

/** Calm, non-error explanation with a way forward (cancelled digestion). */
export function StopNotice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-hairline bg-elevated p-5">
      <p className="text-body-lg font-medium text-ink">{title}</p>
      <p className="text-body-md text-mute">{body}</p>
      {action}
    </div>
  )
}
