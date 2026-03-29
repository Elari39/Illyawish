import { LogOut } from 'lucide-react'

import { ThemeToggle } from '../../../components/theme-toggle'
import { cn } from '../../../lib/utils'

interface SidebarUserFooterProps {
  collapsed: boolean
  username: string
  signOutLabel: string
  onLogout: () => void
}

export function SidebarUserFooter({
  collapsed,
  username,
  signOutLabel,
  onLogout,
}: SidebarUserFooterProps) {
  return (
    <div className={cn('border-t border-[var(--line)] py-4', collapsed ? 'px-2' : 'px-2.5')}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-sm font-semibold text-[var(--foreground)]"
            title={username}
          >
            {username[0]?.toUpperCase() ?? 'U'}
          </div>
          <ThemeToggle className="h-9 w-9" />
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
            onClick={onLogout}
            title={signOutLabel}
            type="button"
            aria-label={signOutLabel}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-sm font-semibold text-[var(--foreground)]">
            {username[0]?.toUpperCase() ?? 'U'}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-[var(--foreground)]">
            {username}
          </span>
          <ThemeToggle className="h-7 w-7 shrink-0" />
          <button
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
            onClick={onLogout}
            title={signOutLabel}
            type="button"
            aria-label={signOutLabel}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
