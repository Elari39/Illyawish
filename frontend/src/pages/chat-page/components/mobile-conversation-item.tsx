import { MoreHorizontal } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'

interface MobileConversationItemProps {
  conversation: Conversation
  interactionDisabled: boolean
  isActive: boolean
  isActionsOpen: boolean
  isSelected: boolean
  selectionMode: boolean
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
  moveToFolderLabel: string
  addTagsLabel: string
  removeTagsLabel: string
  onSelectConversation: (conversationId: Conversation['id']) => void
  onToggleConversationSelection: (conversationId: Conversation['id']) => void
  onToggleActions: (conversationId: Conversation['id'], anchor?: HTMLButtonElement) => void
  onTogglePinned: (conversation: Conversation) => void
  onRenameConversation: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: Conversation['id']) => void
  onMoveConversationToFolder: (conversation: Conversation) => void
  onAddConversationTags: (conversation: Conversation) => void
  onRemoveConversationTags: (conversation: Conversation) => void
  onCloseActions: () => void
}

export function MobileConversationItem({
  conversation,
  interactionDisabled,
  isActive,
  isActionsOpen,
  isSelected,
  selectionMode,
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
  moveToFolderLabel,
  addTagsLabel,
  removeTagsLabel,
  onSelectConversation,
  onToggleConversationSelection,
  onToggleActions,
  onTogglePinned,
  onRenameConversation,
  onToggleArchivedConversation,
  onDeleteConversation,
  onMoveConversationToFolder,
  onAddConversationTags,
  onRemoveConversationTags,
  onCloseActions,
}: MobileConversationItemProps) {
  const folderLabel = conversation.folder.trim()
  const visibleTags = conversation.tags.slice(0, 2)
  const hiddenTagCount = Math.max(conversation.tags.length - visibleTags.length, 0)

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
            if (selectionMode) {
              onToggleConversationSelection(conversation.id)
            } else {
              onSelectConversation(conversation.id)
            }
            onCloseActions()
          }}
          title={conversation.title}
          type="button"
        >
          <div className="flex items-start gap-2">
            {selectionMode ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 inline-flex h-4 w-4 shrink-0 rounded border',
                  isSelected
                    ? 'border-[var(--brand)] bg-[var(--brand)]'
                    : 'border-[var(--line-strong)] bg-white',
                )}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--foreground)]">
                {conversation.isPinned ? pinnedPrefix : ''}
                {conversation.title}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {formatConversationDate(conversation.updatedAt, locale)}
              </div>
              {folderLabel || visibleTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {folderLabel ? (
                    <span className="rounded-full border border-[var(--line)] bg-white/75 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                      {folderLabel}
                    </span>
                  ) : null}
                  {visibleTags.map((tag) => (
                    <span
                      className="rounded-full bg-[var(--sidebar-accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                  {hiddenTagCount > 0 ? (
                    <span className="rounded-full bg-white/75 px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                      +{hiddenTagCount}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </button>
        {!selectionMode ? (
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
        ) : null}
      </div>

      {isActionsOpen && !selectionMode ? (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() => handleConversationAction(() => onMoveConversationToFolder(conversation))}
              variant="secondary"
            >
              {moveToFolderLabel}
            </Button>
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() => handleConversationAction(() => onAddConversationTags(conversation))}
              variant="secondary"
            >
              {addTagsLabel}
            </Button>
            <Button
              className="px-2 py-2 text-xs"
              disabled={interactionDisabled}
              onClick={() => handleConversationAction(() => onRemoveConversationTags(conversation))}
              variant="secondary"
            >
              {removeTagsLabel}
            </Button>
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
