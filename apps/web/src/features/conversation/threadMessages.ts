import type { ReactNode } from 'react'
import type { ChatThreadMessage } from '../../ui/organisms/ChatThread'

export function assistantMessage(id: string, label: string, text: string | undefined, card?: ReactNode): ChatThreadMessage {
  return { id, role: 'assistant', authorLabel: label, text, card }
}
