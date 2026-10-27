import { describe, expect, it } from 'vitest'
import { backendKey, toolKey } from './backendKey'

describe('backendKey (errors)', () => {
  it('maps backend error keys into the chat namespace', () => {
    expect(backendKey('errors.assistant')).toBe('chat.errors.assistant')
    expect(backendKey('errors.rateLimited')).toBe('chat.errors.rateLimited')
  })

  it.each(['errors.assistantUnavailable', 'errors.unavailable', 'errors.timeout', 'errors.assistantRefusal'])(
    'maps the real API key %s to a specific text, not the generic one',
    (key) => {
      expect(backendKey(key)).not.toBe('chat.errors.generic')
      expect(backendKey(key)).toMatch(/^chat\.errors\./)
    },
  )

  it('falls back to the generic error key for anything unknown', () => {
    expect(backendKey('whatever.else')).toBe('chat.errors.generic')
    expect(backendKey('')).toBe('chat.errors.generic')
  })
})

describe('toolKey (status lines while the assistant works)', () => {
  it.each(['get_run_summary', 'find_products', 'get_product_detail', 'simulate_purchase', 'get_parameters'])(
    'maps the API tool %s to its own status text',
    (tool) => {
      const key = toolKey(`assistant.tool.${tool}`)
      expect(key).toMatch(/^chat\.tool\./)
      expect(key).not.toBe('chat.tool.working')
    },
  )

  it('keeps the mock fixture key working', () => {
    expect(toolKey('assistant.tool.reviewingCritical')).toBe('chat.tool.reviewingCritical')
  })

  it('shows a neutral "working" line, never an error, for a tool it does not know', () => {
    expect(toolKey('assistant.tool.brand_new_tool')).toBe('chat.tool.working')
    expect(toolKey('')).toBe('chat.tool.working')
  })
})
