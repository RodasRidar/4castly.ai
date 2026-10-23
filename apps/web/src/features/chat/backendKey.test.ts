import { describe, expect, it } from 'vitest'
import { backendKey } from './backendKey'

describe('backendKey', () => {
  it('maps backend message keys into the chat namespace', () => {
    expect(backendKey('assistant.tool.reviewingCritical')).toBe('chat.tool.reviewingCritical')
    expect(backendKey('errors.assistant')).toBe('chat.errors.assistant')
  })

  it('falls back to the generic error key for anything unknown', () => {
    expect(backendKey('whatever.else')).toBe('chat.errors.generic')
    expect(backendKey('')).toBe('chat.errors.generic')
  })
})
