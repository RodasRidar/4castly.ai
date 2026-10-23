/** Accepts only same-origin absolute paths, so `?next=` can never become an open redirect. */
export function safeNext(raw: string | null, fallback = '/nuevo'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
