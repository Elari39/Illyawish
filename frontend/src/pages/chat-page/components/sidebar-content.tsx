import {
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { getConversationMonogram } from '../utils'

interface SidebarContentProps {
  collapsed: boolean
  variant: 'desktop' | 'mobile'
  currentConversationId: number | null
  conversations: Conversation[]
  hasMoreConversations: boolean
  searchValue: string
  showArchived: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onSearchChange: (value: string) => void
  onToggleArchived: (value: boolean) => void
  onLoadMore: () => void
  onSelectConversation: (conversationId: number) => void
  onRenameConversation: (conversation: Conversation) => void
  onTogglePinned: (conversation: Conversation) => void
  onToggleArchivedConversation: (conversation: Conversation) => void
  onDeleteConversation: (conversationId: number) => void
  onCreateChat: () => void
  username: string
  onLogout: () => void
}

export function SidebarContent({
  collapsed,
  variant,
  currentConversationId,
  conversations,
  hasMoreConversations,
  searchValue,
  showArchived,
  isLoading,
  isLoadingMore,
  onSearchChange,
  onToggleArchived,
  onLoadMore,
  onSelectConversation,
  onRenameConversation,
  onTogglePinned,
  onToggleArchivedConversation,
  onDeleteConversation,
  onCreateChat,
  username,
  onLogout,
}: SidebarContentProps) {
  const { locale, t } = useI18n()
  const [expandedConversationId, setExpandedConversationId] = useState<number | null>(null)
  const [desktopMenuDirection, setDesktopMenuDirection] = useState<'up' | 'down'>('down')
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const desktopMenuRef = useRef<HTMLDivElement | null>(null)
  const desktopTriggerRefs = useRef(new Map<number, HTMLButtonElement | null>())
  const isMobileVariant = variant === 'mobile' && !collapsed
  const isDesktopVariant = variant === 'desktop' && !collapsed
  const effectiveExpandedConversationId =
    !collapsed &&
    conversations.some((conversation) => conversation.id === expandedConversationId)
      ? expandedConversationId
      : null

  useEffect(() => {
    if (!isDesktopVariant || effectiveExpandedConversationId == null) {
      return
    }

    const expandedConversationIdForEffect = effectiveExpandedConversationId

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      const menu = desktopMenuRef.current
      const trigger = desktopTriggerRefs.current.get(expandedConversationIdForEffect)

      if (!(target instanceof Node)) {
        return
      }

      if (menu?.contains(target) || trigger?.contains(target)) {
        return
      }

      setExpandedConversationId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        desktopTriggerRefs.current.get(expandedConversationIdForEffect)?.focus()
        setExpandedConversationId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [effectiveExpandedConversationId, isDesktopVariant])

  function updateDesktopMenuDirection(conversationId: number) {
    const scrollContainer = scrollContainerRef.current
    const menu = desktopMenuRef.current
    const trigger = desktopTriggerRefs.current.get(conversationId)

    if (scrollContainer == null || menu == null || trigger == null) {
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const spaceBelow = containerRect.bottom - triggerRect.bottom
    const spaceAbove = triggerRect.top - containerRect.top

    setDesktopMenuDirection(
      spaceBelow < menuRect.height && spaceAbove > spaceBelow ? 'up' : 'down',
    )
  }

  function registerDesktopTrigger(
    conversationId: number,
    node: HTMLButtonElement | null,
  ) {
    if (node == null) {
      desktopTriggerRefs.current.delete(conversationId)
      return
    }

    desktopTriggerRefs.current.set(conversationId, node)
  }

  function handleDesktopMenuBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextFocused = event.relatedTarget

    if (!(nextFocused instanceof Node)) {
      setExpandedConversationId(null)
      return
    }

    const menu = desktopMenuRef.current
    const trigger =
      effectiveExpandedConversationId == null
        ? null
        : desktopTriggerRefs.current.get(effectiveExpandedConversationId)

    if (menu?.contains(nextFocused) || trigger?.contains(nextFocused)) {
      return
    }

    setExpandedConversationId(null)
  }

  function handleToggleConversationActions(
    conversationId: number,
    anchor?: HTMLButtonElement,
  ) {
    if (isDesktopVariant && anchor != null) {
      const nextConversationId =
        expandedConversationId === conversationId ? null : conversationId

      registerDesktopTrigger(conversationId, anchor)

      if (nextConversationId == null) {
        setExpandedConversationId(null)
        return
      }

      setDesktopMenuDirection('down')
      flushSync(() => {
        setExpandedConversationId(nextConversationId)
      })
      updateDesktopMenuDirection(nextConversationId)
      return
    }

    setExpandedConversationId((currentId) => (
      currentId === conversationId ? null : conversationId
    ))
  }

  function handleSelectConversation(conversationId: number) {
    onSelectConversation(conversationId)
    setExpandedConversationId(null)
  }

  function handleConversationAction(action: () => void) {
    action()
    setExpandedConversationId(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
            {t('app.name')}
          </span>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
            onClick={onCreateChat}
            title={t('sidebar.newChat')}
            type="button"
            aria-label={t('sidebar.newChat')}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>

        {!collapsed ? (
          <>
            <Input
              placeholder={t('sidebar.searchPlaceholder')}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button
                className="px-3 py-2"
                onClick={() => onToggleArchived(false)}
                variant={showArchived ? 'secondary' : 'primary'}
              >
                {t('sidebar.active')}
              </Button>
              <Button
                className="px-3 py-2"
                onClick={() => onToggleArchived(true)}
                variant={showArchived ? 'primary' : 'secondary'}
              >
                {t('sidebar.archived')}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <div className={cn('flex-1 overflow-y-auto overflow-x-visible pb-2', 'px-2')} ref={scrollContainerRef}>
        {!collapsed ? (
          <p className="mb-1 px-3 text-xs font-medium text-[var(--muted-foreground)]">
            {showArchived ? t('sidebar.archived') : t('sidebar.recents')}
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
              {t('common.loading')}
            </div>
          ) : conversations.length === 0 ? (
            <div
              className={cn(
                'py-4 text-[var(--muted-foreground)]',
                collapsed ? 'px-0 text-center text-xs' : 'px-3 text-sm',
              )}
            >
              {t('sidebar.noConversations')}
            </div>
          ) : (
            conversations.map((conversation) => {
              const isActive = conversation.id === currentConversationId
              const monogram = getConversationMonogram(conversation.title)
              const isMobileActionsOpen = effectiveExpandedConversationId === conversation.id
              const isDesktopMenuOpen = effectiveExpandedConversationId === conversation.id

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative rounded-xl border transition-[border-color,background-color,box-shadow] duration-200',
                    isActive
                      ? 'border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--sidebar-accent)_84%,white)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                      : 'border-transparent hover:border-[var(--line)] hover:bg-white/30',
                    isDesktopMenuOpen &&
                      'z-10 border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--sidebar-accent)_74%,white)] shadow-[0_10px_24px_rgba(26,26,24,0.08)]',
                    collapsed ? 'p-1.5' : 'px-2 py-1.5',
                  )}
                >
                  {collapsed ? (
                    <button
                      aria-label={conversation.title}
                      className="flex w-full justify-center rounded-lg px-0 py-1.5 text-center"
                      onClick={() => handleSelectConversation(conversation.id)}
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
                  ) : isMobileVariant ? (
                    <>
                      <div className="flex items-start gap-2">
                        <button
                          aria-label={conversation.title}
                          className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left"
                          onClick={() => handleSelectConversation(conversation.id)}
                          title={conversation.title}
                          type="button"
                        >
                          <div className="truncate text-sm font-medium text-[var(--foreground)]">
                            {conversation.isPinned ? t('sidebar.pinnedPrefix') : ''}
                            {conversation.title}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                            {formatConversationDate(conversation.updatedAt, locale)}
                          </div>
                        </button>
                        <button
                          aria-expanded={isMobileActionsOpen}
                          aria-label={
                            isMobileActionsOpen
                              ? t('sidebar.hideActions', { title: conversation.title })
                              : t('sidebar.moreActions', { title: conversation.title })
                          }
                          className={cn(
                            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]',
                            isMobileActionsOpen && 'bg-black/[0.05] text-[var(--foreground)]',
                          )}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleToggleConversationActions(
                              conversation.id,
                              event.currentTarget,
                            )
                          }}
                          title={
                            isMobileActionsOpen
                              ? t('sidebar.hideActions', { title: conversation.title })
                              : t('sidebar.moreActions', { title: conversation.title })
                          }
                          type="button"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>

                      {isMobileActionsOpen ? (
                        <div className="mt-2 border-t border-[var(--line)] pt-2">
                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              className="px-2 py-2 text-xs"
                              onClick={() =>
                                handleConversationAction(() => onTogglePinned(conversation))
                              }
                              variant="secondary"
                            >
                              {conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                            </Button>
                            <Button
                              className="px-2 py-2 text-xs"
                              onClick={() =>
                                handleConversationAction(() => onRenameConversation(conversation))
                              }
                              variant="secondary"
                            >
                              {t('sidebar.rename')}
                            </Button>
                            <Button
                              className="px-2 py-2 text-xs"
                              onClick={() =>
                                handleConversationAction(() =>
                                  onToggleArchivedConversation(conversation)
                                )
                              }
                              variant="secondary"
                            >
                              {conversation.isArchived ? t('sidebar.restore') : t('sidebar.archive')}
                            </Button>
                          </div>
                          <Button
                            className="mt-2 w-full px-3 py-2 text-xs"
                            onClick={() =>
                              handleConversationAction(() => onDeleteConversation(conversation.id))
                            }
                            variant="danger"
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {!collapsed && !isMobileVariant ? (
                    <div
                      className="relative flex items-start gap-2"
                      data-conversation-actions={conversation.id}
                    >
                      <button
                        aria-label={conversation.title}
                        className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition-colors"
                        onClick={() => handleSelectConversation(conversation.id)}
                        title={conversation.title}
                        type="button"
                      >
                        <div
                          className={cn(
                            'truncate text-sm font-medium text-[var(--foreground)] transition-colors',
                            isDesktopMenuOpen && 'text-[color-mix(in_srgb,var(--foreground)_92%,black)]',
                          )}
                        >
                          {conversation.isPinned ? t('sidebar.pinnedPrefix') : ''}
                          {conversation.title}
                        </div>
                        <div
                          className={cn(
                            'mt-0.5 text-[11px] tracking-[0.01em] text-[color-mix(in_srgb,var(--muted-foreground)_88%,var(--foreground)_12%)]',
                            isDesktopMenuOpen &&
                              'text-[color-mix(in_srgb,var(--muted-foreground)_72%,var(--foreground)_28%)]',
                          )}
                        >
                          {formatConversationDate(conversation.updatedAt, locale)}
                        </div>
                      </button>

                      <button
                        aria-expanded={isDesktopMenuOpen}
                        aria-haspopup={isDesktopVariant ? 'menu' : undefined}
                        aria-label={
                          isDesktopMenuOpen
                            ? t('sidebar.hideActions', { title: conversation.title })
                            : t('sidebar.moreActions', { title: conversation.title })
                        }
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-[color-mix(in_srgb,var(--muted-foreground)_92%,var(--foreground)_8%)] transition-all duration-200 hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--foreground)] focus-visible:border-[var(--line-strong)] focus-visible:bg-white/80 focus-visible:text-[var(--foreground)] focus-visible:opacity-100',
                          isDesktopMenuOpen
                            ? 'border-[var(--line)] bg-white/85 text-[var(--foreground)] opacity-100 shadow-[0_6px_16px_rgba(26,26,24,0.08)]'
                            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        )}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleToggleConversationActions(
                            conversation.id,
                            event.currentTarget,
                          )
                        }}
                        title={
                          isDesktopMenuOpen
                            ? t('sidebar.hideActions', { title: conversation.title })
                            : t('sidebar.moreActions', { title: conversation.title })
                        }
                        ref={(node) => registerDesktopTrigger(conversation.id, node)}
                        type="button"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {isDesktopMenuOpen ? (
                        <div
                          aria-label={t('sidebar.moreActions', { title: conversation.title })}
                          onBlur={handleDesktopMenuBlur}
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
                            {conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                          </button>
                          <button
                            className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--foreground)_80%,var(--muted-foreground)_20%)] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_54%,white_46%)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20"
                            onClick={() =>
                              handleConversationAction(() => onRenameConversation(conversation))
                            }
                            role="menuitem"
                          >
                            {t('sidebar.rename')}
                          </button>
                          <button
                            className="flex w-full items-center justify-start gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[color-mix(in_srgb,var(--foreground)_80%,var(--muted-foreground)_20%)] transition-colors hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_54%,white_46%)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/20"
                            onClick={() =>
                                handleConversationAction(() =>
                                  onToggleArchivedConversation(conversation)
                                )
                            }
                            role="menuitem"
                          >
                            {conversation.isArchived ? t('sidebar.restore') : t('sidebar.archive')}
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
                            {t('common.delete')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
              {isLoadingMore ? t('common.loading') : t('common.loadMore')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cn('border-t border-[var(--line)] py-4', collapsed ? 'px-2' : 'px-2.5')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-sm font-semibold text-[var(--foreground)]"
              title={username}
            >
              {username[0]?.toUpperCase() ?? 'U'}
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={onLogout}
              title={t('sidebar.signOut')}
              type="button"
              aria-label={t('sidebar.signOut')}
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
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={onLogout}
              title={t('sidebar.signOut')}
              type="button"
              aria-label={t('sidebar.signOut')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
