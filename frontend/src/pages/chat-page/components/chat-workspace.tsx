import type { ComponentProps, ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'
import { ChatComposer } from './chat-composer'
import { MessageList } from './message-list'

type MessageListProps = ComponentProps<typeof MessageList>
type ChatComposerProps = ComponentProps<typeof ChatComposer>

interface ChatWorkspaceProps {
  appName: string
  openSidebarLabel: string
  settingsLabel: string
  adminLabel: string
  headerTitle: string
  isHeroState: boolean
  isComposerExpanded: boolean
  chatError: string | null
  showAdminEntry: boolean
  composerToolTrigger: ReactNode
  modelControl: ReactNode
  onOpenSidebar: () => void
  onOpenSettings: () => void
  onOpenAdmin: () => void
  onToggleComposerExpanded: (expanded: boolean) => void
  messageListProps: MessageListProps
  composerProps: Omit<ChatComposerProps, 'layoutMode' | 'isExpanded' | 'leftContextBar' | 'modelControl' | 'onToggleExpanded' | 'chatError'>
}

export function ChatWorkspace({
  appName,
  openSidebarLabel,
  settingsLabel,
  adminLabel,
  headerTitle,
  isHeroState,
  isComposerExpanded,
  chatError,
  showAdminEntry,
  composerToolTrigger,
  modelControl,
  onOpenSidebar,
  onOpenSettings,
  onOpenAdmin,
  onToggleComposerExpanded,
  messageListProps,
  composerProps,
}: ChatWorkspaceProps) {
  const composer = (
    <ChatComposer
      {...composerProps}
      chatError={chatError}
      layoutMode={isHeroState ? 'hero' : 'docked'}
      isExpanded={isComposerExpanded}
      leftContextBar={composerToolTrigger}
      modelControl={modelControl}
      onToggleExpanded={onToggleComposerExpanded}
    />
  )

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label={openSidebarLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] md:hidden"
            onClick={onOpenSidebar}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span
            className="truncate text-sm font-semibold text-[var(--foreground)] md:text-base"
            data-testid="chat-header-site-name"
          >
            {appName}
          </span>
        </div>

        <div className="min-w-0 text-center">
          {headerTitle ? (
            <h1
              className="truncate text-sm font-medium text-[var(--foreground)] md:text-base"
              data-testid="chat-header-title"
            >
              {headerTitle}
            </h1>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            className="px-3 py-2"
            onClick={onOpenSettings}
            variant="secondary"
          >
            {settingsLabel}
          </Button>
          {showAdminEntry ? (
            <Button
              className="px-3 py-2"
              onClick={onOpenAdmin}
              variant="secondary"
            >
              {adminLabel}
            </Button>
          ) : null}
        </div>
      </header>

      {isHeroState ? (
        <div
          className={cn(
            'flex flex-1 px-4 md:px-8',
            isComposerExpanded
              ? 'min-h-0 py-6'
              : 'items-center justify-center py-10',
          )}
        >
          <div
            className={cn(
              'w-full max-w-4xl',
              isComposerExpanded
                ? 'mx-auto flex h-full min-h-0 flex-col gap-6'
                : 'space-y-8',
            )}
          >
            <div className="mx-auto max-w-2xl">
              <MessageList {...messageListProps} />
            </div>
            {composer}
          </div>
        </div>
      ) : (
        <>
          <MessageList {...messageListProps} />
          {composer}
        </>
      )}
    </main>
  )
}
