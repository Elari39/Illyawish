import type { FocusEvent, RefObject } from 'react'

import { MoreHorizontal, Trash2 } from 'lucide-react'

import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { getConversationMonogram } from '../utils'

interface DesktopConversationItemProps {
  conversation: Conversation
  collapsed: boolean
  isActive: boolean
  isMenuOpen: boolean
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
  onSelectConversation: (conversationId: number) => void
  onToggleActions: (conversationId: number, anchor?: HTMLButtonElement) => void
  onTogglePinned: (conversation: Conversation) => void
  onRenameConversation: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: number) => void
  onCloseActions: () => void
  onDesktopMenuBlur: (event: FocusEvent<HTMLDivElement>) => void
  registerDesktopTrigger: (conversationId: number, node: HTMLButtonElement | null) => void
  desktopMenuRef: RefObject<HTMLDivElement | null>
}

export function DesktopConversationItem({
  conversation,
  collapsed,
  isActive,
  isMenuOpen,
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
  onSelectConversation,
  onToggleActions,
  onTogglePinned,
  onRenameConversation,
  onToggleArchivedConversation,
  onDeleteConversation,
  onCloseActions,
  onDesktopMenuBlur,
  registerDesktopTrigger,
  desktopMenuRef,
}: DesktopConversationItemProps) {
  const monogram = getConversationMonogram(conversation.title)

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
        isMenuOpen &&
          'z-10 border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--sidebar-accent)_74%,white)] shadow-[0_10px_24px_rgba(26,26,24,0.08)]',
        collapsed ? 'p-1.5' : 'px-2 py-1.5',
      )}
    >
      {collapsed ? (
        <button
          aria-label={conversation.title}
          className="flex w-full justify-center rounded-lg px-0 py-1.5 text-center"
          onClick={() => onSelectConversation(conversation.id)}
          title={conversation.title}
          type="button"
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold',
              isActive
                ? 'border-[var(--line-strong)] bg-white text-[var(--foreground)]'
                : 'border-transparent bg-white/60 text-[var(--muted-foreground)]',
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
            onClick={() => {
              onSelectConversation(conversation.id)
              onCloseActions()
            }}
            title={conversation.title}
            type="button"
          >
            <div
              className={cn(
                'truncate text-sm font-medium text-[var(--foreground)] transition-colors',
                isMenuOpen && 'text-[color-mix(in_srgb,var(--foreground)_92%,black)]',
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
          </button>

          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={isMenuOpen ? hideActionsLabel : moreActionsLabel}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-[color-mix(in_srgb,var(--muted-foreground)_92%,var(--foreground)_8%)] transition-all duration-200 hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--foreground)] focus-visible:border-[var(--line-strong)] focus-visible:bg-white/80 focus-visible:text-[var(--foreground)] focus-visible:opacity-100',
              isMenuOpen
                ? 'border-[var(--line)] bg-white/85 text-[var(--foreground)] opacity-100 shadow-[0_6px_16px_rgba(26,26,24,0.08)]'
                : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            )}
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

          {isMenuOpen ? (
            <div
              aria-label={moreActionsLabel}
              onBlur={onDesktopMenuBlur}
              ref={desktopMenuRef}
              role="menu"
              className={cn(
                'absolute right-0 z-20 w-[184px] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--line-strong)_82%,white_18%)] bg-[color-mix(in_srgb,white_88%,var(--app-bg)_12%)] p-2 shadow-[0_18px_40px_rgba(26,26,24,0.16)] backdrop-blur-sm',
                desktopMenuDirection === 'up'
                  ? 'bottom-full mb-2'
                  : 'top-full mt-2',
              )}
            >
              <button
                className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--foreground)_80%,var(--muted-foreground)_20%)] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_54%,white_46%)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20"
                onClick={() =>
                  handleConversationAction(() => onTogglePinned(conversation))
                }
                role="menuitem"
              >
                {conversation.isPinned ? unpinLabel : pinLabel}
              </button>
              <button
                className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--foreground)_80%,var(--muted-foreground)_20%)] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_54%,white_46%)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20"
                onClick={() =>
                  handleConversationAction(() => onRenameConversation(conversation))
                }
                role="menuitem"
              >
                {renameLabel}
              </button>
              <button
                className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--foreground)_80%,var(--muted-foreground)_20%)] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_54%,white_46%)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20"
                onClick={() =>
                  handleConversationAction(() => onToggleArchivedConversation(conversation))
                }
                role="menuitem"
              >
                {conversation.isArchived ? restoreLabel : archiveLabel}
              </button>
              <div
                aria-orientation="horizontal"
                className="my-2 h-px bg-[color-mix(in_srgb,var(--line-strong)_60%,white_40%)]"
                role="separator"
              />
              <button
                className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,white_90%)] hover:text-[color-mix(in_srgb,var(--danger)_88%,black_12%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]/20"
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
