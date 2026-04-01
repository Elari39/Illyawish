import {
  useCallback,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/use-auth'
import { useI18n } from '../i18n/use-i18n'
import type { Conversation } from '../types/chat'
import { ChatContextBar } from './chat-page/components/chat-context-bar'
import { ChatOverlays } from './chat-page/components/chat-overlays'
import { ChatSidebarLayout } from './chat-page/components/chat-sidebar-layout'
import { ChatToolMenuTrigger } from './chat-page/components/chat-tool-menu-trigger'
import { ChatWorkspace } from './chat-page/components/chat-workspace'
import { useAgentWorkspace } from './chat-page/hooks/use-agent-workspace'
import { useChatErrorState } from './chat-page/hooks/use-chat-error-state'
import { useChatPageActions } from './chat-page/hooks/use-chat-page-actions'
import { useChatSession } from './chat-page/hooks/use-chat-session'
import { useConversationList } from './chat-page/hooks/use-conversation-list'
import { useProviderSettings } from './chat-page/hooks/use-provider-settings'
import { useChatUIState } from './chat-page/hooks/use-chat-ui-state'

export function ChatPage() {
  const { user, logout } = useAuth()
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const activeConversationId = params.conversationId ?? null

  const navigateToConversation = useCallback((conversationId: Conversation['id'], replace = false) => {
    navigate(`/chat/s/${conversationId}`, { replace })
  }, [navigate])
  const navigateHome = useCallback((replace = false) => {
    navigate('/chat', { replace })
  }, [navigate])

  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isComposerExpanded, setIsComposerExpanded] = useState(false)
  const chatErrorState = useChatErrorState()
  const uiState = useChatUIState()

  const conversationList = useConversationList({
    activeConversationId,
    onError: chatErrorState.setChatError,
    navigateToConversation,
  })

  const currentConversation =
    conversationList.conversations.find((conversation) => conversation.id === activeConversationId) ??
    null

  const chatSession = useChatSession({
    activeConversationId,
    currentConversation,
    search: conversationList.deferredConversationSearch,
    showArchived: conversationList.showArchived,
    setChatError: chatErrorState.setChatError,
    showToast: uiState.showToast,
    insertCreatedConversation: conversationList.insertCreatedConversation,
    removeConversationFromList: conversationList.removeConversationFromList,
    syncConversationIntoList: conversationList.syncConversationIntoList,
    loadConversations: conversationList.loadConversations,
    navigateToConversation,
    navigateHome,
    setSkipAutoResume: conversationList.setSkipAutoResume,
    t,
    locale,
  })

  const providerSettings = useProviderSettings({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError: chatErrorState.setChatError,
    showToast: uiState.showToast,
  })
  const agentWorkspace = useAgentWorkspace({
    isSettingsOpen: uiState.isSettingsOpen,
    setChatError: chatErrorState.setChatError,
  })
  const interactionDisabled = chatSession.isSending
  const displayConversation =
    currentConversation ?? chatSession.pendingConversation
  const contextBarSettings =
    activeConversationId && displayConversation
      ? displayConversation.settings
      : chatSession.settingsDraft
  const contextBarKnowledgeSpaceIds =
    activeConversationId && displayConversation
      ? displayConversation.knowledgeSpaceIds ?? []
      : chatSession.knowledgeSpaceIdsDraft
  const isHeroState =
    activeConversationId == null &&
    chatSession.messages.length === 0 &&
    !chatSession.isLoadingMessages
  const headerTitle = isHeroState
    ? ''
    : displayConversation?.title
      ?? (activeConversationId ? t('chat.loadingConversation') : '')

  const effectiveComposerExpanded =
    chatSession.composerValue.trim().length > 0 && isComposerExpanded

  const actions = useChatPageActions({
    activeConversationId,
    contextBarSettings,
    interactionDisabled,
    conversationList,
    chatSession,
    providerSettings,
    uiState,
    navigate,
    navigateHome,
    logout,
    setIsSavingSettings,
    setChatError: chatErrorState.setChatError,
    t,
  })

  const composerToolTrigger = (
    <ChatToolMenuTrigger
      knowledgeSpaceIds={contextBarKnowledgeSpaceIds}
      knowledgeSpaces={agentWorkspace.knowledgeSpaces}
      isDisabled={interactionDisabled}
      onOpenKnowledgeSettings={() => actions.handleOpenSettings('knowledge')}
    />
  )

  const modelControl = (
    <ChatContextBar
      compact
      compactVariant="model"
      chatSettings={chatSession.chatSettingsDraft}
      settings={contextBarSettings}
      providerState={providerSettings.providerState}
      knowledgeSpaceIds={contextBarKnowledgeSpaceIds}
      knowledgeSpaces={agentWorkspace.knowledgeSpaces}
      isDisabled={interactionDisabled}
      onOpenKnowledgeSettings={() => actions.handleOpenSettings('knowledge')}
      onProviderModelChange={(value) => void actions.handleProviderModelChange(value)}
      onSetAsDefault={() => void actions.handleSetDefaultProviderModel()}
    />
  )

  const sidebarProps = {
    actionDisabled: interactionDisabled,
    conversationNavigationDisabled: false,
    desktopSidebarToggleDisabled: false,
    currentConversationId: activeConversationId,
    conversations: conversationList.conversations,
    hasMoreConversations: conversationList.hasMoreConversations,
    searchValue: conversationList.conversationSearch,
    showArchived: conversationList.showArchived,
    availableFolders: conversationList.availableFolders,
    availableTags: conversationList.availableTags,
    selectedFolder: conversationList.selectedFolder,
    selectedTags: conversationList.selectedTags,
    selectionMode: conversationList.selectionMode,
    selectedConversationIds: conversationList.selectedConversationIds,
    isLoading: conversationList.isLoadingConversations,
    isLoadingMore: conversationList.isLoadingMoreConversations,
    onSearchChange: conversationList.setConversationSearch,
    onToggleArchived: conversationList.setShowArchived,
    onSelectFolder: conversationList.setSelectedFolder,
    onToggleTag: conversationList.toggleSelectedTag,
    onSetSelectionMode: conversationList.setSelectionMode,
    onToggleConversationSelection: conversationList.toggleConversationSelection,
    onMoveConversationToFolder: actions.handleMoveConversationToFolder,
    onAddConversationTags: actions.handleAddConversationTags,
    onRemoveConversationTags: actions.handleRemoveConversationTags,
    onBulkMoveToFolder: actions.handleBulkMoveToFolder,
    onBulkAddTags: actions.handleBulkAddTags,
    onBulkRemoveTags: actions.handleBulkRemoveTags,
    onLoadMore: () => void conversationList.loadConversations({ append: true }),
    onSelectConversation: (conversationId: Conversation['id']) => {
      navigateToConversation(conversationId)
      uiState.setSidebarOpen(false)
    },
    onRenameConversation: actions.handleRenameConversation,
    onTogglePinned: actions.handleTogglePinned,
    onToggleArchivedConversation: actions.handleToggleArchived,
    onDeleteConversation: actions.handleDeleteConversation,
    onCreateChat: actions.handleCreateNewChat,
    username: user?.username ?? '',
    onLogout: actions.handleLogout,
  }

  const messageListProps = {
    activeConversationId,
    hasMoreMessages: chatSession.hasMoreMessages,
    isLoadingMessages: chatSession.isLoadingMessages,
    isLoadingOlderMessages: chatSession.isLoadingOlderMessages,
    messages: chatSession.messages,
    latestUserMessage: chatSession.latestUserMessage,
    isSending: chatSession.isSending,
    editingMessageId: chatSession.editingMessageId,
    hasConversationShell: displayConversation != null,
    viewportRef: chatSession.messageViewportRef,
    onShowToast: uiState.showToast,
    onEditMessage: chatSession.startEditingMessage,
    onLoadMore: () => void chatSession.loadOlderMessages(),
    onRetryMessage: (message: Parameters<typeof chatSession.handleRetryAssistant>[0]) => void chatSession.handleRetryAssistant(message),
    onRegenerateMessage: (message: Parameters<typeof chatSession.handleRegenerateAssistant>[0]) => void chatSession.handleRegenerateAssistant(message),
  }

  const composerProps = {
    composerFormRef: chatSession.composerFormRef,
    fileInputRef: chatSession.fileInputRef,
    composerValue: chatSession.composerValue,
    selectedAttachments: chatSession.selectedAttachments,
    editingMessageId: chatSession.editingMessageId,
    hasPendingUploads: chatSession.hasPendingUploads,
    canSubmitComposer: chatSession.canSubmitComposer,
    isSending: chatSession.isSending,
    composerIsComposingRef: chatSession.composerIsComposingRef,
    onComposerChange: chatSession.setComposerValue,
    onCancelEdit: chatSession.cancelEditingMessage,
    onStopGeneration: () => void chatSession.handleStopGeneration(),
    onSubmit: (event: Parameters<typeof chatSession.handleSubmit>[0]) => void chatSession.handleSubmit(event),
    onFilesSelected: (files: File[]) => void chatSession.handleFilesSelected(files),
    onRemoveAttachment: chatSession.removeSelectedAttachment,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--foreground)]">
      <ChatSidebarLayout
        isMobileOpen={uiState.sidebarOpen}
        onCloseMobile={() => uiState.setSidebarOpen(false)}
        isDesktopCollapsed={uiState.isDesktopSidebarCollapsed}
        onToggleDesktopSidebar={() =>
          uiState.setIsDesktopSidebarCollapsed((previous) => !previous)
        }
        {...sidebarProps}
      />

      <ChatWorkspace
        appName={t('app.name')}
        openSidebarLabel={t('chat.openSidebar')}
        settingsLabel={t('chat.settings')}
        adminLabel={t('chat.admin')}
        headerTitle={headerTitle}
        isHeroState={isHeroState}
        isComposerExpanded={effectiveComposerExpanded}
        chatError={chatErrorState.chatError}
        showAdminEntry={user?.role === 'admin'}
        composerToolTrigger={composerToolTrigger}
        modelControl={modelControl}
        onDismissChatError={chatErrorState.clearChatError}
        onOpenSidebar={() => uiState.setSidebarOpen(true)}
        onOpenSettings={() => actions.handleOpenSettings('chat')}
        onOpenAdmin={() => navigate('/admin')}
        onToggleComposerExpanded={setIsComposerExpanded}
        messageListProps={messageListProps}
        composerProps={composerProps}
      />

      <ChatOverlays
        activeTab={uiState.activeSettingsTab}
        chatSettings={chatSession.chatSettingsDraft}
        confirmation={uiState.confirmation}
        conversationFolder={chatSession.conversationFolderDraft}
        conversationTags={chatSession.conversationTagsDraft}
        showArchived={conversationList.showArchived}
        availableFolders={conversationList.availableFolders}
        availableTags={conversationList.availableTags}
        selectedFolder={conversationList.selectedFolder}
        selectedTags={conversationList.selectedTags}
        knowledgeSpaceIds={chatSession.knowledgeSpaceIdsDraft}
        pendingKnowledgeSpaceIds={chatSession.pendingKnowledgeSpaceIds}
        editingProviderId={providerSettings.editingProviderId}
        isLoadingProviders={providerSettings.isLoadingProviders}
        isOpen={uiState.isSettingsOpen}
        isSaving={isSavingSettings}
        isImporting={chatSession.isImporting}
        isSavingProvider={providerSettings.isSavingProvider}
        isTestingProvider={providerSettings.isTestingProvider}
        messageCount={chatSession.messages.length}
        selectedConversationIds={conversationList.selectedConversationIds}
        selectionMode={conversationList.selectionMode}
        onExport={chatSession.handleExportConversation}
        onImport={(file) => void actions.handleImportConversation(file)}
        onActivateProvider={providerSettings.handleActivateProvider}
        onCreateRAGProvider={agentWorkspace.createRAGProvider}
        onActivateRAGProvider={agentWorkspace.activateRAGProvider}
        onLoadKnowledgeDocuments={agentWorkspace.loadKnowledgeDocuments}
        onToggleKnowledgeSpace={(space) => chatSession.toggleKnowledgeSpace(space.id)}
        onCreateKnowledgeSpace={agentWorkspace.createKnowledgeSpace}
        onUpdateKnowledgeSpace={agentWorkspace.updateKnowledgeSpace}
        onDeleteKnowledgeSpace={agentWorkspace.deleteKnowledgeSpace}
        onCreateKnowledgeDocument={agentWorkspace.createKnowledgeDocument}
        onUpdateKnowledgeDocument={agentWorkspace.updateKnowledgeDocument}
        onDeleteKnowledgeDocument={agentWorkspace.deleteKnowledgeDocument}
        onUploadKnowledgeDocuments={agentWorkspace.uploadKnowledgeDocuments}
        onReplaceKnowledgeDocumentFile={agentWorkspace.replaceKnowledgeDocumentFile}
        onCloseConfirmation={() => uiState.setConfirmation(null)}
        onClosePrompt={() => uiState.setPromptState(null)}
        onCloseSettings={() => uiState.setIsSettingsOpen(false)}
        onDeleteProvider={actions.handleDeleteProvider}
        onDismissToast={(toastId) =>
          uiState.dismissToast(toastId)
        }
        onPauseToast={uiState.pauseToast}
        onResumeToast={uiState.resumeToast}
        onEditProvider={providerSettings.handleEditProvider}
        onProviderFieldChange={providerSettings.handleProviderFieldChange}
        onProviderModelsChange={providerSettings.handleProviderModelsChange}
        onProviderTabChange={uiState.setActiveSettingsTab}
        onReset={chatSession.resetSettingsDraft}
        onResetProvider={providerSettings.handleStartNewProvider}
        onSave={actions.handleSaveSettings}
        onSaveProvider={providerSettings.handleSaveProvider}
        onStartNewProvider={providerSettings.handleStartNewProvider}
        onTestProvider={providerSettings.handleTestProvider}
        promptState={uiState.promptState}
        providerForm={providerSettings.providerForm}
        providerState={providerSettings.providerState}
        ragProviderState={agentWorkspace.ragProviders}
        knowledgeSpaces={agentWorkspace.knowledgeSpaces}
        knowledgeDocuments={agentWorkspace.knowledgeDocuments}
        transferConversation={displayConversation}
        settings={chatSession.settingsDraft}
        setChatSettings={chatSession.setChatSettingsDraft}
        setConversationFolder={chatSession.setConversationFolderDraft}
        setConversationTags={chatSession.setConversationTagsDraft}
        onToggleArchived={conversationList.setShowArchived}
        onSelectFolder={conversationList.setSelectedFolder}
        onToggleTag={conversationList.toggleSelectedTag}
        onSetSelectionMode={conversationList.setSelectionMode}
        onBulkMoveToFolder={actions.handleBulkMoveToFolder}
        onBulkAddTags={actions.handleBulkAddTags}
        onBulkRemoveTags={actions.handleBulkRemoveTags}
        setSettings={chatSession.setSettingsDraft}
        toasts={uiState.toasts}
      />
    </div>
  )
}
