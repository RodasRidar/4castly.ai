import { describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../../services/types'
import { applyStreamEvent, startDraft, type Draft } from './streamDraft'

const run = (events: ChatStreamEvent[], draft: Draft = startDraft('m-1')) => events.reduce(applyStreamEvent, draft)

const usage = { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0 }

describe('stream draft reducer', () => {
  it('starts streaming and empty', () => {
    expect(startDraft('m-1')).toEqual({ messageId: 'm-1', text: '', tools: [], annotations: [], phase: 'streaming', error: null })
  })

  it('adopts the server message id from message.start', () => {
    expect(run([{ event: 'message.start', message_id: 'srv-9' }]).messageId).toBe('srv-9')
  })

  it('appends text deltas in order', () => {
    const draft = run([
      { event: 'text.delta', message_id: 'm-1', text: '7 ' },
      { event: 'text.delta', message_id: 'm-1', text: 'productos' },
    ])
    expect(draft.text).toBe('7 productos')
  })

  it('shows a tool status only between tool.start and tool.end', () => {
    const during = run([{ event: 'tool.start', tool_call_id: 't1', status_key: 'assistant.tool.reviewingCritical' }])
    expect(during.tools).toEqual([{ id: 't1', statusKey: 'assistant.tool.reviewingCritical' }])
    const after = applyStreamEvent(during, { event: 'tool.end', tool_call_id: 't1' })
    expect(after.tools).toEqual([])
  })

  it('collects annotations', () => {
    const annotation = { start: 0, end: 3, type: 'product' as const, code: 'QF-1' }
    expect(run([{ event: 'annotation', message_id: 'm-1', annotation }]).annotations).toEqual([annotation])
  })

  it('finishes on message.end and tells a normal end from a cancelled one', () => {
    expect(run([{ event: 'message.end', message_id: 'm-1', stop_reason: 'end_turn', usage }]).phase).toBe('done')
    expect(run([{ event: 'message.end', message_id: 'm-1', stop_reason: 'cancelled', usage }]).phase).toBe('interrupted')
  })

  it('treats a truncated answer as interrupted', () => {
    expect(run([{ event: 'message.end', message_id: 'm-1', stop_reason: 'max_tokens', usage }]).phase).toBe('interrupted')
  })

  it('records an error event with its key and reference and clears running tools', () => {
    const draft = run([
      { event: 'tool.start', tool_call_id: 't1', status_key: 'assistant.tool.reviewingCritical' },
      { event: 'text.delta', message_id: 'm-1', text: 'parcial' },
      { event: 'error', message_key: 'errors.assistant', ref: 'K7Q2WX' },
    ])
    expect(draft).toMatchObject({ phase: 'error', text: 'parcial', tools: [], error: { messageKey: 'errors.assistant', ref: 'K7Q2WX' } })
  })

  it('keeps an already settled draft untouched by late events', () => {
    const done = run([{ event: 'message.end', message_id: 'm-1', stop_reason: 'end_turn', usage }])
    expect(applyStreamEvent(done, { event: 'text.delta', message_id: 'm-1', text: 'late' })).toBe(done)
  })
})
