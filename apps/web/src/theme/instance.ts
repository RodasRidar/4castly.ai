import { createThemeStore } from './themeStore'

/** App-wide singleton, bound to the real document. Tests build their own store with createThemeStore. */
export const themeStore = createThemeStore({
  root: document.documentElement,
  storage: window.localStorage,
  matchMedia: window.matchMedia.bind(window),
})
