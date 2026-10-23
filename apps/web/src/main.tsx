import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/theme.css'
import App from './App.tsx'
import { TokensPage } from './dev/TokensPage.tsx'

// Temporary path switch until the router lands in F3; /dev/* stays dev-only.
const Root = import.meta.env.DEV && location.pathname === '/dev/tokens' ? TokensPage : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
