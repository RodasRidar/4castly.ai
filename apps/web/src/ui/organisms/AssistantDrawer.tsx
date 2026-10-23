import { Drawer } from './Drawer'
import { ChatThread, type ChatThreadProps } from './ChatThread'
import { Composer, type ComposerProps } from './Composer'
import { SuggestionChips, type SuggestionChipsProps } from '../molecules/SuggestionChips'

export interface AssistantDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  /** Scope of the chat: the run or product it is about. */
  contextLine: string
  thread: ChatThreadProps
  composer: ComposerProps
  suggestions?: SuggestionChipsProps
}

export function AssistantDrawer({ open, onOpenChange, title, closeLabel, contextLine, thread, composer, suggestions }: AssistantDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel}>
      <p className="-mt-2 mb-2 truncate text-body-sm text-mute">{contextLine}</p>
      <ChatThread {...thread} />
      <div className="flex flex-col gap-3 pt-3">
        {suggestions && <SuggestionChips {...suggestions} />}
        <Composer {...composer} />
      </div>
    </Drawer>
  )
}
