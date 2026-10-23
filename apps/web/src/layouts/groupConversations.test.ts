import { describe, expect, it } from 'vitest'
import type { Conversation } from '../services/types'
import { groupConversations } from './groupConversations'

const labels = { pinned: 'Fijados', today: 'Hoy', this_week: 'Esta semana', older: 'Antes' }
const conv = (id: string, group: Conversation['group'], at: string, extra: Partial<Conversation> = {}): Conversation => ({
  id,
  title: id,
  stage: 'ready',
  group,
  pinned: group === 'pinned',
  archived: false,
  file_name: null,
  current_job_id: null,
  current_run_id: null,
  created_at: at,
  last_activity_at: at,
  deleted_at: null,
  ...extra,
})

describe('groupConversations', () => {
  it('follows the API buckets in fixed order and drops empty groups', () => {
    const groups = groupConversations(
      [conv('old', 'older', '2026-08-01T10:00:00Z'), conv('today', 'today', '2026-10-23T08:00:00Z'), conv('pin', 'pinned', '2026-01-01T08:00:00Z')],
      labels,
    )
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ['Fijados', ['pin']],
      ['Hoy', ['today']],
      ['Antes', ['old']],
    ])
  })

  it('sorts newest first inside a group and links each item', () => {
    const [group] = groupConversations([conv('a', 'today', '2026-10-23T07:00:00Z'), conv('b', 'today', '2026-10-23T09:00:00Z')], labels)
    expect(group.items.map((i) => i.id)).toEqual(['b', 'a'])
    expect(group.items[0].href).toBe('/c/b')
  })

  it.each([
    ['digesting', 'processing'],
    ['calculating', 'processing'],
    ['failed', 'failed'],
    ['unreadable', 'failed'],
    ['ready', undefined],
    ['awaiting_confirmation', undefined],
  ] as const)('maps stage %s to status %s', (stage, status) => {
    const [group] = groupConversations([conv('x', 'today', '2026-10-23T07:00:00Z', { stage })], labels)
    expect(group.items[0].status).toBe(status)
  })

  it('returns no groups for an empty list', () => {
    expect(groupConversations([], labels)).toEqual([])
  })
})
