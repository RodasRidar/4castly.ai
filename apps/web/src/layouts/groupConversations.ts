import type { ConversationListGroup } from '../ui/organisms/ConversationList'
import type { Conversation } from '../services/ports'

const DAY = 86_400_000

interface Labels {
  pinned: string
  today: string
  thisWeek: string
  earlier: string
}

/** Pinned first, then by recency. Buckets are computed on the client until the contract carries them. */
export function groupConversations(items: Conversation[], labels: Labels, now = Date.now()): ConversationListGroup[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const buckets: Record<'pinned' | 'today' | 'thisWeek' | 'earlier', ConversationListGroup['items']> = {
    pinned: [],
    today: [],
    thisWeek: [],
    earlier: [],
  }
  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const c of sorted) {
    const entry = { id: c.id, title: c.title, href: `/c/${c.id}`, pinned: c.pinned, status: c.status }
    const time = Date.parse(c.updatedAt)
    const bucket = c.pinned ? 'pinned' : time >= startOfToday ? 'today' : time >= startOfToday - 6 * DAY ? 'thisWeek' : 'earlier'
    buckets[bucket].push(entry)
  }
  return (['pinned', 'today', 'thisWeek', 'earlier'] as const)
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, title: labels[id], items: buckets[id] }))
}
