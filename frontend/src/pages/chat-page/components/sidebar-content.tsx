import { useI18n } from '../../../i18n/use-i18n'
import { type SidebarContentProps } from './sidebar-content-types'
import { SidebarConversationList } from './sidebar-conversation-list'
import { SidebarHeader } from './sidebar-header'
import { SidebarUserFooter } from './sidebar-user-footer'
import { useSidebarActionMenu } from './use-sidebar-action-menu'

export type { SidebarContentProps } from './sidebar-content-types'

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
  const {
    scrollContainerRef,
    desktopMenuRef,
    desktopMenuDirection,
    isMobileVariant,
    effectiveExpandedConversationId,
    registerDesktopTrigger,
    handleDesktopMenuBlur,
    handleToggleConversationActions,
    closeExpandedActions,
  } = useSidebarActionMenu({
    collapsed,
    variant,
    conversations,
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SidebarHeader
        collapsed={collapsed}
        searchValue={searchValue}
        showArchived={showArchived}
        appName={t('app.name')}
        newChatLabel={t('sidebar.newChat')}
        searchPlaceholder={t('sidebar.searchPlaceholder')}
        activeLabel={t('sidebar.active')}
        archivedLabel={t('sidebar.archived')}
        onSearchChange={onSearchChange}
        onToggleArchived={onToggleArchived}
        onCreateChat={onCreateChat}
      />

      <SidebarConversationList
        collapsed={collapsed}
        currentConversationId={currentConversationId}
        conversations={conversations}
        hasMoreConversations={hasMoreConversations}
        showArchived={showArchived}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        isMobileVariant={isMobileVariant}
        locale={locale}
        recentsLabel={t('sidebar.recents')}
        archivedLabel={t('sidebar.archived')}
        loadingLabel={t('common.loading')}
        noConversationsLabel={t('sidebar.noConversations')}
        loadMoreLabel={t('common.loadMore')}
        pinnedPrefix={t('sidebar.pinnedPrefix')}
        hideActionsLabel={(title) => t('sidebar.hideActions', { title })}
        moreActionsLabel={(title) => t('sidebar.moreActions', { title })}
        pinLabel={t('sidebar.pin')}
        unpinLabel={t('sidebar.unpin')}
        renameLabel={t('sidebar.rename')}
        archiveLabel={t('sidebar.archive')}
        restoreLabel={t('sidebar.restore')}
        deleteLabel={t('common.delete')}
        onLoadMore={onLoadMore}
        onSelectConversation={onSelectConversation}
        onTogglePinned={onTogglePinned}
        onRenameConversation={onRenameConversation}
        onToggleArchivedConversation={onToggleArchivedConversation}
        onDeleteConversation={onDeleteConversation}
        effectiveExpandedConversationId={effectiveExpandedConversationId}
        desktopMenuDirection={desktopMenuDirection}
        scrollContainerRef={scrollContainerRef}
        desktopMenuRef={desktopMenuRef}
        registerDesktopTrigger={registerDesktopTrigger}
        onDesktopMenuBlur={handleDesktopMenuBlur}
        onToggleConversationActions={handleToggleConversationActions}
        onCloseActions={closeExpandedActions}
      />

      <SidebarUserFooter
        collapsed={collapsed}
        username={username}
        signOutLabel={t('sidebar.signOut')}
        onLogout={onLogout}
      />
    </div>
  )
}
