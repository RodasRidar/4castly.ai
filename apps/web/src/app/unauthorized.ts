/** Dispatched on `window` by the HTTP layer when the API answers 401 (token expired or revoked). */
export const UNAUTHORIZED_EVENT = 'app:unauthorized'

export const announceUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
