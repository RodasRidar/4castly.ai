import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'

/**
 * `ui/` organisms render plain `<a href>` so they stay router-agnostic. This turns same-origin left clicks on
 * them into client-side navigation, which is what keeps the sidebar mounted instead of reloading the page.
 */
export function useClientNavigation() {
  const navigate = useNavigate()
  return (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element).closest?.('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return
    if (anchor.hasAttribute('download')) return
    if (anchor.target && anchor.target !== '_self') return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return
    event.preventDefault()
    void navigate(`${url.pathname}${url.search}${url.hash}`)
  }
}
