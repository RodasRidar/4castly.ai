export interface ChatPanelProps {
  conversationId: string
  /** Scopes the assistant to one product (product detail drawer). */
  productCode?: string
  /** Suggested questions shown above the composer. */
  suggestions?: string[]
  className?: string
}

/** Stub: unit C (chat) replaces the body. Keep the props. */
export function ChatPanel({ className }: ChatPanelProps) {
  return <div className={className} />
}
