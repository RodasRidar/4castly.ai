import { describe, expect, it } from 'vitest'
import type { Conversation } from '../services/ports'
import { groupConversations } from './groupConversations'

const labels = { pinned: 'Fijados', today: 'Hoy', thisWeek: 'Esta semana', earlier: 'Antes' }
const now = new Date('2026-10-23T15:00:00').getTime()
const at = (iso: string): Pick<Conversation, 'updatedAt'> => ({ updatedAt: new Date(iso).toISOString() })
const conv = (id: string, iso: string, extra: Partial<Conversation> = {}): Conversation => ({
  id,
  title: id,
  pinned: false,
  ...at(iso),
  ...extra,
})

describe('groupConversations', () => {
  it('buckets by recency, pinned first, and drops empty groups', () => {
    const groups = groupConversations(
      [
        conv('old', '2026-08-01T10:00:00'),
        conv('today', '2026-10-23T08:00:00'),
        conv('week', '2026-10-19T08:00:00'),
        conv('pin', '2026-01-01T08:00:00', { pinned: true }),
      ],
      labels,
      now,
    )
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ['Fijados', ['pin']],
      ['Hoy', ['today']],
      ['Esta semana', ['week']],
      ['Antes', ['old']],
    ])
  })

  it('sorts newest first inside a group and links each item', () => {
    const [group] = groupConversations([conv('a', '2026-10-23T07:00:00'), conv('b', '2026-10-23T09:00:00')], labels, now)
    expect(group.items.map((i) => i.id)).toEqual(['b', 'a'])
    expect(group.items[0].href).toBe('/c/b')
  })

  it('returns no groups for an empty list', () => {
    expect(groupConversations([], labels, now)).toEqual([])
  })
})
