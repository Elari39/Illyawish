import type { FocusEvent, RefObject } from 'react'

import { MoreHorizontal, Trash2 } from 'lucide-react'

import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { getConversationMonogram } from '../utils'

const menuItemClassName =
  'flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--menu-hover-bg)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20'

interface DesktopConversationItemProps {
  conversation: Conversation
  collapsed: boolean
  actionDisabled: boolean
  navigationDisabled: boolean
  isActive: boolean
  isMenuOpen: boolean
  isSelected: boolean
  selectionMode: boolean
  desktopMenuDirection: 'up' | 'down'
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
  onDesktopMenuBlur: (event: FocusEvent<HTMLDivElement>) => void
  registerDesktopTrigger: (conversationId: Conversation['id'], node: HTMLButtonElement | null) => void
  desktopMenuRef: RefObject<HTMLDivElement | null>
}

export function DesktopConversationItem({
  conversation,
  collapsed,
  actionDisabled,
  navigationDisabled,
  isActive,
  isMenuOpen,
  isSelected,
  selectionMode,
  desktopMenuDirection,
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
  onDesktopMenuBlur,
  registerDesktopTrigger,
  desktopMenuRef,
}: DesktopConversationItemProps) {
  const monogram = getConversationMonogram(conversation.title)
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
          ? 'border-[var(--line-strong)] bg-[var(--sidebar-item-active-bg)] shadow-[var(--sidebar-item-active-shadow)]'
          : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--hover-bg)]',
        isMenuOpen &&
          'z-10 border-[var(--line-strong)] bg-[var(--sidebar-item-open-bg)] shadow-[var(--menu-shadow)]',
        collapsed ? 'p-1.5' : 'px-2 py-1.5',
      )}
    >
      {collapsed ? (
        <button
          aria-label={conversation.title}
          className="flex w-full justify-center rounded-lg px-0 py-1.5 text-center"
          disabled={navigationDisabled}
          onClick={() => onSelectConversation(conversation.id)}
          title={conversation.title}
          type="button"
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold',
              isActive
                ? 'border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--foreground)]'
                : 'border-transparent bg-[var(--hover-bg)] text-[var(--muted-foreground)]',
            )}
          >
            {monogram}
          </div>
        </button>
      ) : (
        <div
          className="relative flex items-start gap-2"
          data-conversation-actions={conversation.id}
        >
          <button
            aria-label={conversation.title}
            className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition-colors"
            disabled={navigationDisabled}
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
                      : 'border-[var(--line-strong)] bg-[var(--surface-strong)]',
                  )}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'truncate text-sm font-medium text-[var(--foreground)] transition-colors',
                    isMenuOpen && 'text-[var(--foreground)]',
                  )}
                >
                  {conversation.isPinned ? pinnedPrefix : ''}
                  {conversation.title}
                </div>
                <div
                  className={cn(
                    'mt-0.5 text-[11px] tracking-[0.01em] text-[color-mix(in_srgb,var(--muted-foreground)_88%,var(--foreground)_12%)]',
                    isMenuOpen &&
                      'text-[color-mix(in_srgb,var(--muted-foreground)_72%,var(--foreground)_28%)]',
                  )}
                >
                  {formatConversationDate(conversation.updatedAt, locale)}
                </div>
                {folderLabel || visibleTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {folderLabel ? (
                      <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
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
                      <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
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
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label={isMenuOpen ? hideActionsLabel : moreActionsLabel}
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-[color-mix(in_srgb,var(--muted-foreground)_92%,var(--foreground)_8%)] transition-all duration-200 hover:border-[var(--line)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] focus-visible:border-[var(--line-strong)] focus-visible:bg-[var(--surface-strong)] focus-visible:text-[var(--foreground)] focus-visible:opacity-100',
                isMenuOpen
                  ? 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] opacity-100 shadow-[var(--shadow-md)]'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
              )}
              disabled={actionDisabled}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleActions(conversation.id, event.currentTarget)
              }}
              title={isMenuOpen ? hideActionsLabel : moreActionsLabel}
              ref={(node) => registerDesktopTrigger(conversation.id, node)}
              type="button"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : null}

          {isMenuOpen && !selectionMode ? (
            <div
              aria-label={moreActionsLabel}
              onBlur={onDesktopMenuBlur}
              ref={desktopMenuRef}
              role="menu"
              className={cn(
                'absolute right-0 z-20 w-[184px] overflow-hidden rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-bg)] p-2 shadow-[var(--menu-shadow)] backdrop-blur-sm',
                desktopMenuDirection === 'up'
                  ? 'bottom-full mb-2'
                  : 'top-full mt-2',
              )}
            >
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onMoveConversationToFolder(conversation))
                }
                role="menuitem"
              >
                {moveToFolderLabel}
              </button>
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onAddConversationTags(conversation))
                }
                role="menuitem"
              >
                {addTagsLabel}
              </button>
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onRemoveConversationTags(conversation))
                }
                role="menuitem"
              >
                {removeTagsLabel}
              </button>
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onTogglePinned(conversation))
                }
                role="menuitem"
              >
                {conversation.isPinned ? unpinLabel : pinLabel}
              </button>
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onRenameConversation(conversation))
                }
                role="menuitem"
              >
                {renameLabel}
              </button>
              <button
                className={menuItemClassName}
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onToggleArchivedConversation(conversation))
                }
                role="menuitem"
              >
                {conversation.isArchived ? restoreLabel : archiveLabel}
              </button>
              <div
                aria-orientation="horizontal"
                className="my-2 h-px bg-[var(--menu-separator)]"
                role="separator"
              />
              <button
                className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]/20"
                disabled={actionDisabled}
                onClick={() =>
                  handleConversationAction(() => onDeleteConversation(conversation.id))
                }
                role="menuitem"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteLabel}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
