import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createThemeStore, resolveTheme } from './themeStore'

function fakeMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | undefined
  const mql = {
    matches: initial,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => (listener = fn),
    removeEventListener: () => (listener = undefined),
  }
  return {
    matchMedia: () => mql as unknown as MediaQueryList,
    change(matches: boolean) {
      mql.matches = matches
      listener?.({ matches })
    },
  }
}

describe('resolveTheme', () => {
  it('returns explicit preferences unchanged', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('follows the OS for system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('createThemeStore', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement('html')
    localStorage.clear()
  })

  it('defaults to system and applies data-theme', () => {
    const media = fakeMedia(true)
    const store = createThemeStore({ root, storage: localStorage, matchMedia: media.matchMedia })
    expect(store.getPreference()).toBe('system')
    expect(root.dataset.theme).toBe('dark')
  })

  it('persists the preference and applies it', () => {
    const media = fakeMedia(false)
    const store = createThemeStore({ root, storage: localStorage, matchMedia: media.matchMedia })
    store.setPreference('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem('4castly.theme')).toBe('dark')
    const again = createThemeStore({ root: document.createElement('html'), storage: localStorage, matchMedia: media.matchMedia })
    expect(again.getPreference()).toBe('dark')
  })

  it('ignores corrupt stored values', () => {
    localStorage.setItem('4castly.theme', 'purple')
    const store = createThemeStore({ root, storage: localStorage, matchMedia: fakeMedia(false).matchMedia })
    expect(store.getPreference()).toBe('system')
  })

  it('tracks OS changes only while on system', () => {
    const media = fakeMedia(false)
    const store = createThemeStore({ root, storage: localStorage, matchMedia: media.matchMedia })
    media.change(true)
    expect(root.dataset.theme).toBe('dark')
    store.setPreference('light')
    media.change(true)
    expect(root.dataset.theme).toBe('light')
  })

  it('notifies subscribers and supports unsubscribe', () => {
    const store = createThemeStore({ root, storage: localStorage, matchMedia: fakeMedia(false).matchMedia })
    const fn = vi.fn()
    const off = store.subscribe(fn)
    store.setPreference('dark')
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    store.setPreference('light')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('survives unavailable storage', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } as unknown as Storage
    const store = createThemeStore({ root, storage: broken, matchMedia: fakeMedia(false).matchMedia })
    expect(() => store.setPreference('dark')).not.toThrow()
    expect(root.dataset.theme).toBe('dark')
  })
})
