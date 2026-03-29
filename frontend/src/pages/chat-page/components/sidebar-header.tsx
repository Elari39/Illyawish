import { Menu, MessageSquarePlus } from 'lucide-react'

import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

interface SidebarHeaderProps {
  collapsed: boolean
  desktopSidebarExpanded?: boolean
  interactionDisabled: boolean
  searchValue: string
  appName: string
  expandSidebarLabel?: string
  collapseSidebarLabel?: string
  newChatLabel: string
  searchPlaceholder: string
  onToggleDesktopSidebar?: () => void
  onSearchChange: (value: string) => void
  onCreateChat: () => void
}

export function SidebarHeader({
  collapsed,
  desktopSidebarExpanded = !collapsed,
  interactionDisabled,
  searchValue,
  appName,
  expandSidebarLabel,
  collapseSidebarLabel,
  newChatLabel,
  searchPlaceholder,
  onToggleDesktopSidebar,
  onSearchChange,
  onCreateChat,
}: SidebarHeaderProps) {
  const desktopToggleLabel = desktopSidebarExpanded ? collapseSidebarLabel : expandSidebarLabel
  const showDesktopToggle = onToggleDesktopSidebar && desktopToggleLabel

  return (
    <div
      className={cn(
        'space-y-4 pb-4 pt-5 transition-[padding] duration-200',
        collapsed ? 'px-2' : 'px-3',
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          {showDesktopToggle ? (
            <button
              aria-expanded={desktopSidebarExpanded}
              aria-label={desktopToggleLabel}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
              disabled={interactionDisabled}
              onClick={onToggleDesktopSidebar}
              title={desktopToggleLabel}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
            disabled={interactionDisabled}
            onClick={onCreateChat}
            title={newChatLabel}
            type="button"
            aria-label={newChatLabel}
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {appName}
            </span>
            {showDesktopToggle ? (
              <button
                aria-expanded={desktopSidebarExpanded}
                aria-label={desktopToggleLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
                disabled={interactionDisabled}
                onClick={onToggleDesktopSidebar}
                title={desktopToggleLabel}
                type="button"
              >
                <Menu className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--hover-bg)]"
            disabled={interactionDisabled}
            onClick={onCreateChat}
            title={newChatLabel}
            type="button"
            aria-label={newChatLabel}
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span>{newChatLabel}</span>
          </button>

          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </>
      )}
    </div>
  )
}
