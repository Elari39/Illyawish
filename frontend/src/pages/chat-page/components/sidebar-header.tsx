import { MessageSquarePlus } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

interface SidebarHeaderProps {
  collapsed: boolean
  interactionDisabled: boolean
  searchValue: string
  showArchived: boolean
  appName: string
  newChatLabel: string
  searchPlaceholder: string
  activeLabel: string
  archivedLabel: string
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onCreateChat: () => void
}

export function SidebarHeader({
  collapsed,
  interactionDisabled,
  searchValue,
  showArchived,
  appName,
  newChatLabel,
  searchPlaceholder,
  activeLabel,
  archivedLabel,
  onSearchChange,
  onToggleArchived,
  onCreateChat,
}: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        'space-y-4 pb-4 pt-5 transition-[padding] duration-200',
        collapsed ? 'px-2' : 'px-3',
      )}
    >
      <div
        className={cn(
          'flex items-center',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <span
          className={cn(
            'text-sm font-semibold text-[var(--foreground)] transition-opacity duration-200',
            collapsed ? 'pointer-events-none w-0 overflow-hidden opacity-0' : 'opacity-100',
          )}
        >
          {appName}
        </span>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
          disabled={interactionDisabled}
          onClick={onCreateChat}
          title={newChatLabel}
          type="button"
          aria-label={newChatLabel}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>

      {!collapsed ? (
        <>
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              className="px-3 py-2"
              onClick={() => onToggleArchived(false)}
              variant={showArchived ? 'secondary' : 'primary'}
            >
              {activeLabel}
            </Button>
            <Button
              className="px-3 py-2"
              onClick={() => onToggleArchived(true)}
              variant={showArchived ? 'primary' : 'secondary'}
            >
              {archivedLabel}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
