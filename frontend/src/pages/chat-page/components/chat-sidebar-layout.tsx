import type { ComponentProps } from 'react'

import { cn } from '../../../lib/utils'
import { MobileSidebar } from './mobile-sidebar'
import { SidebarContent } from './sidebar-content'

type SidebarBaseProps = Omit<ComponentProps<typeof SidebarContent>, 'collapsed' | 'variant' | 'desktopSidebarExpanded'>

interface ChatSidebarLayoutProps extends SidebarBaseProps {
  isMobileOpen: boolean
  onCloseMobile: () => void
  isDesktopCollapsed: boolean
  onToggleDesktopSidebar: () => void
}

export function ChatSidebarLayout({
  isMobileOpen,
  onCloseMobile,
  isDesktopCollapsed,
  onToggleDesktopSidebar,
  ...sidebarProps
}: ChatSidebarLayoutProps) {
  return (
    <>
      <MobileSidebar
        isOpen={isMobileOpen}
        onClose={onCloseMobile}
        {...sidebarProps}
      />

      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar-bg)] transition-[width] duration-200 md:flex',
          isDesktopCollapsed ? 'w-[72px]' : 'w-[272px]',
        )}
      >
        <SidebarContent
          key={isDesktopCollapsed ? 'desktop-sidebar-collapsed' : 'desktop-sidebar-expanded'}
          collapsed={isDesktopCollapsed}
          variant="desktop"
          desktopSidebarExpanded={!isDesktopCollapsed}
          onToggleDesktopSidebar={onToggleDesktopSidebar}
          {...sidebarProps}
        />
      </aside>
    </>
  )
}

