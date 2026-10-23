import { Menu } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router'
import { useIsDesktop } from '../app/useMediaQuery'
import { IconButton } from '../ui/atoms/IconButton'
import { Logo } from '../ui/atoms/Logo'
import { AppSidebar } from './AppSidebar'

const COLLAPSED_KEY = '4castly.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Sidebar (persistent from `md`, drawer below) plus the page. It never remounts between conversations. */
export function AppLayout() {
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { pathname } = useLocation()
  // The drawer belongs to the page it was opened on, so navigating closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null)
  const drawerOpen = drawerPath === pathname

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1')
      } catch {
        // Not persisted; the choice still holds for this session.
      }
      return !prev
    })
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      {isDesktop ? (
        <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      ) : (
        <>
          <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <IconButton label={t('nav.openMenu')} icon={Menu} onClick={() => setDrawerPath(pathname)} />
            <Logo />
          </header>
          <AppSidebar collapsed={false} onToggleCollapsed={toggleCollapsed} mobile={{ open: drawerOpen, onOpenChange: (open) => setDrawerPath(open ? pathname : null) }} />
        </>
      )}
      <main id="main" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
