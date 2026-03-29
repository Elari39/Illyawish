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
  desktopSidebarExpanded = !collapsed,
  interactionDisabled = false,
  currentConversationId,
  conversations,
  hasMoreConversations,
  searchValue,
  showArchived,
  selectionMode = false,
  selectedConversationIds = [],
  isLoading,
  isLoadingMore,
  onSearchChange,
  onToggleConversationSelection = () => undefined,
  onMoveConversationToFolder = () => undefined,
  onAddConversationTags = () => undefined,
  onRemoveConversationTags = () => undefined,
  onLoadMore,
  onSelectConversation,
  onRenameConversation,
  onTogglePinned,
  onToggleArchivedConversation,
  onDeleteConversation,
  onToggleDesktopSidebar,
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
    interactionDisabled: interactionDisabled || selectionMode,
    conversations,
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SidebarHeader
        collapsed={collapsed}
        desktopSidebarExpanded={desktopSidebarExpanded}
        interactionDisabled={interactionDisabled}
        searchValue={searchValue}
        appName={t('app.name')}
        expandSidebarLabel={t('chat.expandSidebar')}
        collapseSidebarLabel={t('chat.collapseSidebar')}
        newChatLabel={t('sidebar.newChat')}
        searchPlaceholder={t('sidebar.searchPlaceholder')}
        onToggleDesktopSidebar={onToggleDesktopSidebar}
        onSearchChange={onSearchChange}
        onCreateChat={onCreateChat}
      />

      {!(variant === 'desktop' && collapsed) ? (
        <SidebarConversationList
          collapsed={collapsed}
          interactionDisabled={interactionDisabled}
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
          moveToFolderLabel={t('sidebar.moveToFolder')}
          addTagsLabel={t('sidebar.addTags')}
          removeTagsLabel={t('sidebar.removeTags')}
          selectionMode={selectionMode}
          selectedConversationIds={selectedConversationIds}
          onLoadMore={onLoadMore}
          onSelectConversation={onSelectConversation}
          onToggleConversationSelection={onToggleConversationSelection}
          onTogglePinned={onTogglePinned}
          onRenameConversation={onRenameConversation}
          onToggleArchivedConversation={onToggleArchivedConversation}
          onDeleteConversation={onDeleteConversation}
          onMoveConversationToFolder={onMoveConversationToFolder}
          onAddConversationTags={onAddConversationTags}
          onRemoveConversationTags={onRemoveConversationTags}
          effectiveExpandedConversationId={effectiveExpandedConversationId}
          desktopMenuDirection={desktopMenuDirection}
          scrollContainerRef={scrollContainerRef}
          desktopMenuRef={desktopMenuRef}
          registerDesktopTrigger={registerDesktopTrigger}
          onDesktopMenuBlur={handleDesktopMenuBlur}
          onToggleConversationActions={handleToggleConversationActions}
          onCloseActions={closeExpandedActions}
        />
      ) : (
        <div className="flex-1" />
      )}

      <SidebarUserFooter
        collapsed={collapsed}
        username={username}
        signOutLabel={t('sidebar.signOut')}
        onLogout={onLogout}
      />
    </div>
  )
}
