import type { Conversation, ConversationGroup } from '../services/types'
import type { ConversationListEntry, ConversationListGroup } from '../ui/organisms/ConversationList'

const ORDER: ConversationGroup[] = ['pinned', 'today', 'this_week', 'older']

/** The API assigns each conversation its bucket; the sidebar only orders and labels them. */
export function groupConversations(items: Conversation[], labels: Record<ConversationGroup, string>): ConversationListGroup[] {
  const sorted = [...items].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
  return ORDER.map((group) => ({
    id: group,
    title: labels[group],
    items: sorted.filter((c) => c.group === group).map(toEntry),
  })).filter((g) => g.items.length > 0)
}

/** Sidebar item state derives from the stage (plan 2.1): spinner while working, red dot on failure. */
function statusOf(stage: Conversation['stage']): ConversationListEntry['status'] {
  if (stage === 'queued' || stage === 'uploaded' || stage === 'digesting' || stage === 'calculating') return 'processing'
  if (stage === 'failed' || stage === 'unreadable') return 'failed'
  return undefined
}

function toEntry(c: Conversation): ConversationListEntry {
  return { id: c.id, title: c.title, href: `/c/${c.id}`, pinned: c.pinned, status: statusOf(c.stage) }
}
