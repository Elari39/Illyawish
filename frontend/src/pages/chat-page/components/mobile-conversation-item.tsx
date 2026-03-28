import { MoreHorizontal } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'

interface MobileConversationItemProps {
  conversation: Conversation
  interactionDisabled: boolean
  isActive: boolean
  isActionsOpen: boolean
  locale: string
  pinnedPrefix: string
  hideActionsLabel: string
  moreActionsLabel: string
  pinLabel: string
  unpinLabel: string
  renameLabel: string
  archiveLabel: string
  restoreLabel: string
  deleteLabel: string
  onSelectConversation: (conversationId: Conversation['id']) => void
  onToggleActions: (conversationId: Conversation['id'], anchor?: HTMLButtonElement) => void
  onTogglePinned: (conversation: Conversation) => void
  onRenameConversation: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: Conversation['id']) => void
  onCloseActions: () => void
}

export function MobileConversationItem({
  conversation,
  interactionDisabled,
  isActive,
  isActionsOpen,
  locale,
  pinnedPrefix,
  hideActionsLabel,
  moreActionsLabel,
  pinLabel,
  unpinLabel,
  renameLabel,
  archiveLabel,
  restoreLabel,
  deleteLabel,
  onSelectConversation,
  onToggleActions,
  onTogglePinned,
  onRenameConversation,
  onToggleArchivedConversation,
  onDeleteConversation,
  onCloseActions,
}: MobileConversationItemProps) {
  function handleConversationAction(action: () => void) {
    action()
    onCloseActions()
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border transition-[border-color,background-color,box-shadow] duration-200',
        isActive
          ? 'border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--sidebar-accent)_84%,white)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
          : 'border-transparent hover:border-[var(--line)] hover:bg-white/30',
        'px-2 py-1.5',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={conversation.title}
          className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left"
          disabled={interactionDisabled}
          onClick={() => {
            onSelectConversation(conversation.id)
            onCloseActions()
          }}
          title={conversation.title}
          type="button"
        >
          <div className="truncate text-sm font-medium text-[var(--foreground)]">
            {conversation.isPinned ? pinnedPrefix : ''}
            {conversation.title}
          </div>
          <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {formatConversationDate(conversation.updatedAt, locale)}
          </div>
        </button>
        <button
          aria-expanded={isActionsOpen}
          aria-label={isActionsOpen ? hideActionsLabel : moreActionsLabel}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]',
            isActionsOpen && 'bg-black/[0.05] text-[var(--foreground)]',
          )}
          disabled={interactionDisabled}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleActions(conversation.id, event.currentTarget)
          }}
          title={isActionsOpen ? hideActionsLabel : moreActionsLabel}
          type="button"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {isActionsOpen ? (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() => handleConversationAction(() => onTogglePinned(conversation))}
              variant="secondary"
            >
              {conversation.isPinned ? unpinLabel : pinLabel}
            </Button>
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() => handleConversationAction(() => onRenameConversation(conversation))}
              variant="secondary"
            >
              {renameLabel}
            </Button>
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() =>
                handleConversationAction(() => onToggleArchivedConversation(conversation))
              }
              variant="secondary"
            >
              {conversation.isArchived ? restoreLabel : archiveLabel}
            </Button>
          </div>
          <Button
            className="mt-2 w-full px-3 py-2 text-xs"
            disabled={interactionDisabled}
            onClick={() =>
              handleConversationAction(() => onDeleteConversation(conversation.id))
            }
            variant="danger"
          >
            {deleteLabel}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
