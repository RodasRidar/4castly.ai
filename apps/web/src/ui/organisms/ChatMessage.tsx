import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { FileChip, type FileChipProps } from '../molecules/FileChip'
import { InlineNotice, type NoticeTone } from '../molecules/InlineNotice'
import { MessageActions, type MessageActionsProps } from '../molecules/MessageActions'
import { StreamingText } from '../molecules/StreamingText'
import { ToolStatusLine } from '../molecules/ToolStatusLine'

export interface ChatMessageProps {
  role: 'user' | 'assistant'
  /** Accessible name of the message (e.g. "Tú", "Asistente"). */
  authorLabel: string
  /** User: plain text. Assistant: Markdown received so far. */
  text?: string
  /** User attachment. */
  file?: Pick<FileChipProps, 'name' | 'size'>
  /** Assistant: still receiving tokens. */
  streaming?: boolean
  /** Assistant: human tool status texts while the agent works. */
  toolLines?: string[]
  /** Assistant: hidden while streaming. */
  actions?: Omit<MessageActionsProps, 'className'>
  /** Assistant: embedded card (e.g. a product summary). */
  card?: ReactNode
  /** Assistant: partial answer or error note, shown after the (kept) partial text. */
  note?: { tone: NoticeTone; title?: string; text: string }
  className?: string
}

export function ChatMessage({ role, authorLabel, text, file, streaming = false, toolLines, actions, card, note, className }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <article aria-label={authorLabel} data-role="user" className={cn('flex flex-col items-end gap-2', className)}>
        {file && <FileChip name={file.name} size={file.size} />}
        {text && <p className="max-w-[85%] rounded-lg bg-selected px-3 py-2 text-body-md whitespace-pre-wrap text-ink">{text}</p>}
      </article>
    )
  }
  return (
    <article aria-label={authorLabel} data-role="assistant" className={cn('flex max-w-full flex-col items-start gap-2', className)}>
      {toolLines?.map((line) => <ToolStatusLine key={line} text={line} />)}
      {(text || streaming) && <StreamingText streaming={streaming}>{text ?? ''}</StreamingText>}
      {card && <div className="w-full">{card}</div>}
      {note && (
        <InlineNotice tone={note.tone} title={note.title} className="w-full">
          {note.text}
        </InlineNotice>
      )}
      {actions && !streaming && <MessageActions {...actions} />}
    </article>
  )
}
