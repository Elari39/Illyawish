import { LogOut, MessageSquarePlus, Trash2 } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useI18n } from '../../../i18n/use-i18n'
import { formatConversationDate, cn } from '../../../lib/utils'
import type { Conversation } from '../../../types/chat'
import { getConversationMonogram } from '../utils'

interface SidebarContentProps {
  collapsed: boolean
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={cn(
          'space-y-4 pb-4 pt-5 transition-[padding] duration-200',
          collapsed ? 'px-2' : 'px-4',
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

      <div className={cn('flex-1 overflow-y-auto pb-2', 'px-2')}>
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

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group rounded-xl border border-transparent transition-colors',
                    isActive
                      ? 'border-[var(--line)] bg-[var(--sidebar-accent)]'
                      : 'hover:bg-black/[0.04]',
                    collapsed ? 'p-1.5' : 'p-2',
                  )}
                >
                  <button
                    aria-label={conversation.title}
                    className={cn(
                      'w-full min-w-0',
                      collapsed
                        ? 'flex justify-center rounded-lg px-0 py-1.5 text-center'
                        : 'text-left',
                    )}
                    onClick={() => onSelectConversation(conversation.id)}
                    title={conversation.title}
                    type="button"
                  >
                    {collapsed ? (
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
                    ) : (
                      <>
                        <div className="truncate text-sm font-medium text-[var(--foreground)]">
                          {conversation.isPinned ? t('sidebar.pinnedPrefix') : ''}
                          {conversation.title}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                          {formatConversationDate(conversation.updatedAt, locale)}
                        </div>
                      </>
                    )}
                  </button>

                  {!collapsed ? (
                    <div className="mt-2 flex flex-wrap gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onTogglePinned(conversation)}
                        variant="ghost"
                      >
                        {conversation.isPinned ? t('sidebar.unpin') : t('sidebar.pin')}
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onRenameConversation(conversation)}
                        variant="ghost"
                      >
                        {t('sidebar.rename')}
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        onClick={() => onToggleArchivedConversation(conversation)}
                        variant="ghost"
                      >
                        {conversation.isArchived ? t('sidebar.restore') : t('sidebar.archive')}
                      </Button>
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--danger)]"
                        onClick={() => onDeleteConversation(conversation.id)}
                        type="button"
                        aria-label={t('sidebar.deleteConversation', {
                          title: conversation.title,
                        })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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

      <div className={cn('border-t border-[var(--line)] py-4', collapsed ? 'px-2' : 'px-3')}>
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
