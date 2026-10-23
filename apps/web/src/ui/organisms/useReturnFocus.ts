import { useLayoutEffect, useRef } from 'react'

/**
 * Radix modal dialogs only restore focus to their own <Dialog.Trigger>. Ours are opened from arbitrary
 * controls (menu items, buttons), so remember the focused element on open and restore it on close.
 * A layout effect runs before Radix's passive focus-scope effect, so the activeElement is still the opener.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  return (event: Event) => {
    event.preventDefault()
    opener.current?.focus()
  }
}
