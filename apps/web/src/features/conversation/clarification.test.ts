import { describe, expect, it } from 'vitest'
import type { PlanView } from '../../services/types'
import { backendKey, buildClarification, toAnswers } from './clarification'

const plan = (over: Partial<PlanView>) => ({ source_kind: 'tabular', mappings: [], ...over }) as PlanView

describe('buildClarification', () => {
  it('asks lead time and, without a stock column, stockouts', () => {
    const c = buildClarification(plan({ mappings: [{ field: 'stock', column: null, required: false, samples: [], detail: null }] }))
    expect(c.questions.map((q) => q.id)).toEqual(['lead_time_days', 'had_stockouts'])
    expect(c.questions[0].options.map((o) => o.value)).toEqual(['7', '14', '30'])
    expect(c.questions[0].allows_other).toBe(true)
  })

  it('skips the stockout question when the file has a stock column', () => {
    const c = buildClarification(plan({ mappings: [{ field: 'stock', column: 'Saldo', required: false, samples: [], detail: null }] }))
    expect(c.questions.map((q) => q.id)).toEqual(['lead_time_days'])
  })

  it('skips the stockout question for Kardex files, which carry balances', () => {
    expect(buildClarification(plan({ source_kind: 'kardex' })).questions.map((q) => q.id)).toEqual(['lead_time_days'])
  })
})

describe('backendKey', () => {
  it('maps a contract label key into this area namespace', () => {
    expect(backendKey('clarification.leadTime.days7')).toBe('conversation.clarification.leadTime.days7')
  })
})

describe('toAnswers', () => {
  it('parses a positive whole number of days', () => {
    expect(toAnswers('14', 'no')).toEqual({ lead_time_days: 14, had_stockouts: 'no' })
    expect(toAnswers('21', null)).toEqual({ lead_time_days: 21 })
  })
  it.each(['', 'abc', '0', '-3', '2.5'])('rejects %j as lead time', (value) => expect(toAnswers(value, null)).toBeNull())
})
