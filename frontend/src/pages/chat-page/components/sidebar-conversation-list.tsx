import type { FocusEvent, RefObject } from 'react'

import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { DesktopConversationItem } from './desktop-conversation-item'
import { MobileConversationItem } from './mobile-conversation-item'

interface SidebarConversationListProps {
  collapsed: boolean
  interactionDisabled: boolean
  currentConversationId: Conversation['id'] | null
  conversations: Conversation[]
  hasMoreConversations: boolean
  showArchived: boolean
  isLoading: boolean
  isLoadingMore: boolean
  isMobileVariant: boolean
  locale: string
  recentsLabel: string
  archivedLabel: string
  loadingLabel: string
  noConversationsLabel: string
  loadMoreLabel: string
  pinnedPrefix: string
  hideActionsLabel: (title: string) => string
  moreActionsLabel: (title: string) => string
  pinLabel: string
  unpinLabel: string
  renameLabel: string
  archiveLabel: string
  restoreLabel: string
  deleteLabel: string
  onLoadMore: () => void
  onSelectConversation: (conversationId: Conversation['id']) => void
  onTogglePinned: (conversation: Conversation) => void
  onRenameConversation: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: Conversation['id']) => void
  effectiveExpandedConversationId: Conversation['id'] | null
  desktopMenuDirection: 'up' | 'down'
  scrollContainerRef: RefObject<HTMLDivElement | null>
  desktopMenuRef: RefObject<HTMLDivElement | null>
  registerDesktopTrigger: (conversationId: Conversation['id'], node: HTMLButtonElement | null) => void
  onDesktopMenuBlur: (event: FocusEvent<HTMLDivElement>) => void
  onToggleConversationActions: (conversationId: Conversation['id'], anchor?: HTMLButtonElement) => void
  onCloseActions: () => void
}

export function SidebarConversationList({
  collapsed,
  interactionDisabled,
  currentConversationId,
  conversations,
  hasMoreConversations,
  showArchived,
  isLoading,
  isLoadingMore,
  isMobileVariant,
  locale,
  recentsLabel,
  archivedLabel,
  loadingLabel,
  noConversationsLabel,
  loadMoreLabel,
  pinnedPrefix,
  hideActionsLabel,
  moreActionsLabel,
  pinLabel,
  unpinLabel,
  renameLabel,
  archiveLabel,
  restoreLabel,
  deleteLabel,
  onLoadMore,
  onSelectConversation,
  onTogglePinned,
  onRenameConversation,
  onToggleArchivedConversation,
  onDeleteConversation,
  effectiveExpandedConversationId,
  desktopMenuDirection,
  scrollContainerRef,
  desktopMenuRef,
  registerDesktopTrigger,
  onDesktopMenuBlur,
  onToggleConversationActions,
  onCloseActions,
}: SidebarConversationListProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto overflow-x-visible pb-2', 'px-2')} ref={scrollContainerRef}>
      {!collapsed ? (
        <p className="mb-1 px-3 text-xs font-medium text-[var(--muted-foreground)]">
          {showArchived ? archivedLabel : recentsLabel}
        </p>
      ) : null}
      <div className="space-y-1">
        {isLoading ? (
          <div
            className={cn(
              'py-4 text-[var(--muted-foreground)]',
              collapsed ? 'px-0 text-center text-xs' : 'px-3 text-sm',
            )}
          >
            {loadingLabel}
          </div>
        ) : conversations.length === 0 ? (
          <div
            className={cn(
              'py-4 text-[var(--muted-foreground)]',
              collapsed ? 'px-0 text-center text-xs' : 'px-3 text-sm',
            )}
          >
            {noConversationsLabel}
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === currentConversationId
            const isActionsOpen = effectiveExpandedConversationId === conversation.id

            if (isMobileVariant) {
              return (
                <MobileConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  interactionDisabled={interactionDisabled}
                  isActive={isActive}
                  isActionsOpen={isActionsOpen}
                  locale={locale}
                  pinnedPrefix={pinnedPrefix}
                  hideActionsLabel={hideActionsLabel(conversation.title)}
                  moreActionsLabel={moreActionsLabel(conversation.title)}
                  pinLabel={pinLabel}
                  unpinLabel={unpinLabel}
                  renameLabel={renameLabel}
                  archiveLabel={archiveLabel}
                  restoreLabel={restoreLabel}
                  deleteLabel={deleteLabel}
                  onSelectConversation={onSelectConversation}
                  onToggleActions={onToggleConversationActions}
                  onTogglePinned={onTogglePinned}
                  onRenameConversation={onRenameConversation}
                  onToggleArchivedConversation={onToggleArchivedConversation}
                  onDeleteConversation={onDeleteConversation}
                  onCloseActions={onCloseActions}
                />
              )
            }

            return (
              <DesktopConversationItem
                key={conversation.id}
                conversation={conversation}
                collapsed={collapsed}
                interactionDisabled={interactionDisabled}
                isActive={isActive}
                isMenuOpen={isActionsOpen}
                desktopMenuDirection={desktopMenuDirection}
                locale={locale}
                pinnedPrefix={pinnedPrefix}
                hideActionsLabel={hideActionsLabel(conversation.title)}
                moreActionsLabel={moreActionsLabel(conversation.title)}
                pinLabel={pinLabel}
                unpinLabel={unpinLabel}
                renameLabel={renameLabel}
                archiveLabel={archiveLabel}
                restoreLabel={restoreLabel}
                deleteLabel={deleteLabel}
                onSelectConversation={onSelectConversation}
                onToggleActions={onToggleConversationActions}
                onTogglePinned={onTogglePinned}
                onRenameConversation={onRenameConversation}
                onToggleArchivedConversation={onToggleArchivedConversation}
                onDeleteConversation={onDeleteConversation}
                onCloseActions={onCloseActions}
                onDesktopMenuBlur={onDesktopMenuBlur}
                registerDesktopTrigger={registerDesktopTrigger}
                desktopMenuRef={desktopMenuRef}
              />
            )
          })
        )}
      </div>

      {!collapsed && !isLoading && hasMoreConversations ? (
        <div className="px-2 pt-3">
          <Button
            className="w-full"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            variant="secondary"
          >
            {isLoadingMore ? loadingLabel : loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
