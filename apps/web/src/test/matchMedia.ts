/** jsdom has no matchMedia. This stub evaluates min/max-width and prefers-color-scheme against a mutable viewport. */
let width = 1440
let prefersDark = false
const listeners = new Set<() => void>()

function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query)
  if (min) return width >= Number(min[1])
  const max = /\(max-width:\s*(\d+)px\)/.exec(query)
  if (max) return width <= Number(max[1])
  if (query.includes('prefers-color-scheme: dark')) return prefersDark
  return false
}

export function installMatchMedia() {
  window.matchMedia = (query: string) => {
    const mql = {
      media: query,
      get matches() {
        return evaluate(query)
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }
    return mql as unknown as MediaQueryList
  }
}

export function setViewport(next: { width?: number; prefersDark?: boolean }) {
  if (next.width !== undefined) width = next.width
  if (next.prefersDark !== undefined) prefersDark = next.prefersDark
  listeners.forEach((fn) => fn())
}

export function resetViewport() {
  width = 1440
  prefersDark = false
}
