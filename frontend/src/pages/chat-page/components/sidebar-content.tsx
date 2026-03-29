import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { SIDEBAR_UNFILED_FOLDER_KEY } from '../utils'
import { type SidebarContentProps } from './sidebar-content-types'
import { SidebarConversationList } from './sidebar-conversation-list'
import { SidebarHeader } from './sidebar-header'
import { SidebarUserFooter } from './sidebar-user-footer'
import { useSidebarActionMenu } from './use-sidebar-action-menu'

export type { SidebarContentProps } from './sidebar-content-types'

export function SidebarContent({
  collapsed,
  variant,
  interactionDisabled = false,
  currentConversationId,
  conversations,
  hasMoreConversations,
  searchValue,
  showArchived,
  availableFolders = [],
  availableTags = [],
  selectedFolder = null,
  selectedTags = [],
  selectionMode = false,
  selectedConversationIds = [],
  isLoading,
  isLoadingMore,
  onSearchChange,
  onToggleArchived,
  onSelectFolder = () => undefined,
  onToggleTag = () => undefined,
  onSetSelectionMode = () => undefined,
  onToggleConversationSelection = () => undefined,
  onMoveConversationToFolder = () => undefined,
  onAddConversationTags = () => undefined,
  onRemoveConversationTags = () => undefined,
  onBulkMoveToFolder = () => undefined,
  onBulkAddTags = () => undefined,
  onBulkRemoveTags = () => undefined,
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
  const [isFoldersOpen, setIsFoldersOpen] = useState(false)
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
        interactionDisabled={interactionDisabled}
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

      {!collapsed ? (
        <div className="space-y-3 px-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <button
              className="inline-flex flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
              onClick={() => setIsFoldersOpen((previous) => !previous)}
              type="button"
            >
              {isFoldersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {t('sidebar.foldersTitle')}
            </button>
            <button
              className={cn(
                'rounded-xl border px-3 py-2 text-xs font-medium transition',
                selectionMode
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                  : 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-[var(--surface-strong)]',
              )}
              onClick={() => onSetSelectionMode(!selectionMode)}
              type="button"
            >
              {selectionMode ? t('sidebar.selectionDone') : t('sidebar.selectionMode')}
            </button>
          </div>

          {selectionMode ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {t('sidebar.selectedCount', { count: selectedConversationIds.length })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-[var(--line)] bg-[var(--app-bg)] px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                  disabled={selectedConversationIds.length === 0}
                  onClick={onBulkMoveToFolder}
                  type="button"
                >
                  {t('sidebar.moveSelected')}
                </button>
                <button
                  className="rounded-xl border border-[var(--line)] bg-[var(--app-bg)] px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                  disabled={selectedConversationIds.length === 0}
                  onClick={onBulkAddTags}
                  type="button"
                >
                  {t('sidebar.addTagsSelected')}
                </button>
                <button
                  className="rounded-xl border border-[var(--line)] bg-[var(--app-bg)] px-3 py-2 text-xs font-medium text-[var(--foreground)]"
                  disabled={selectedConversationIds.length === 0}
                  onClick={onBulkRemoveTags}
                  type="button"
                >
                  {t('sidebar.removeTagsSelected')}
                </button>
              </div>
            </div>
          ) : null}

          {isFoldersOpen ? (
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3">
              <div className="space-y-2">
                <FolderFilterButton
                  active={selectedFolder == null}
                  label={t('sidebar.allFolders')}
                  onClick={() => onSelectFolder(null)}
                />
                <FolderFilterButton
                  active={selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY}
                  label={t('sidebar.unfiled')}
                  onClick={() => onSelectFolder(SIDEBAR_UNFILED_FOLDER_KEY)}
                />
                {availableFolders.map((folder) => (
                  <FolderFilterButton
                    key={folder}
                    active={selectedFolder === folder}
                    label={folder}
                    onClick={() => onSelectFolder(folder)}
                  />
                ))}
              </div>

              {availableTags.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    {t('sidebar.tagsTitle')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => {
                      const active = selectedTags.some((value) => value.toLowerCase() === tag.toLowerCase())
                      return (
                        <button
                          key={tag}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-medium transition',
                            active
                              ? 'bg-[var(--brand)] text-white'
                              : 'bg-[var(--app-bg)] text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]',
                          )}
                          onClick={() => onToggleTag(tag)}
                          type="button"
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

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

      <SidebarUserFooter
        collapsed={collapsed}
        username={username}
        signOutLabel={t('sidebar.signOut')}
        onLogout={onLogout}
      />
    </div>
  )
}

function FolderFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition',
        active
          ? 'bg-[var(--brand)] text-white'
          : 'bg-[var(--app-bg)] text-[var(--foreground)] hover:bg-[var(--sidebar-accent)]',
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}
