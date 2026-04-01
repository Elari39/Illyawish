import type { Dispatch, ReactNode, SetStateAction } from 'react'

import type { I18nContextValue } from '../../i18n/context'
import type { Conversation } from '../../types/chat'
import type { useAgentWorkspace } from './hooks/use-agent-workspace'
import type { useChatErrorState } from './hooks/use-chat-error-state'
import type { useChatPageActions } from './hooks/use-chat-page-actions'
import type { useChatSession } from './hooks/use-chat-session'
import type { useChatUIState } from './hooks/use-chat-ui-state'
import type { useConversationList } from './hooks/use-conversation-list'
import type { useProviderSettings } from './hooks/use-provider-settings'

type ConversationListController = ReturnType<typeof useConversationList>
type ChatSessionController = ReturnType<typeof useChatSession>
type ProviderSettingsController = ReturnType<typeof useProviderSettings>
type AgentWorkspaceController = ReturnType<typeof useAgentWorkspace>
type ChatUIStateController = ReturnType<typeof useChatUIState>
type ChatErrorStateController = ReturnType<typeof useChatErrorState>
type ChatPageActionsController = ReturnType<typeof useChatPageActions>

interface BuildNavigationOptions {
  navigate: (to: string, options?: { replace?: boolean }) => void
}

export function createChatPageNavigation({ navigate }: BuildNavigationOptions) {
  function navigateToConversation(
    conversationId: Conversation['id'],
    replace = false,
  ) {
    navigate(`/chat/s/${conversationId}`, { replace })
  }

  function navigateHome(replace = false) {
    navigate('/chat', { replace })
  }

  return {
    navigateToConversation,
    navigateHome,
  }
}

interface BuildViewModelOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  chatSession: ChatSessionController
  isComposerExpanded: boolean
  t: I18nContextValue['t']
}

export function buildChatPageViewModel({
  activeConversationId,
  currentConversation,
  chatSession,
  isComposerExpanded,
  t,
}: BuildViewModelOptions) {
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
    : displayConversation?.title ??
      (activeConversationId ? t('chat.loadingConversation') : '')
  const effectiveComposerExpanded =
    chatSession.composerValue.trim().length > 0 && isComposerExpanded

  return {
    displayConversation,
    contextBarSettings,
    contextBarKnowledgeSpaceIds,
    isHeroState,
    headerTitle,
    effectiveComposerExpanded,
  }
}

interface BuildSidebarPropsOptions {
  activeConversationId: Conversation['id'] | null
  interactionDisabled: boolean
  conversationList: ConversationListController
  uiState: ChatUIStateController
  actions: ChatPageActionsController
  navigateToConversation: (
    conversationId: Conversation['id'],
    replace?: boolean,
  ) => void
  user: {
    username?: string
  } | null
}

export function buildSidebarProps({
  activeConversationId,
  interactionDisabled,
  conversationList,
  uiState,
  actions,
  navigateToConversation,
  user,
}: BuildSidebarPropsOptions) {
  return {
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
}

interface BuildMessageListPropsOptions {
  activeConversationId: Conversation['id'] | null
  displayConversation: Conversation | null
  chatSession: ChatSessionController
  uiState: ChatUIStateController
}

export function buildMessageListProps({
  activeConversationId,
  displayConversation,
  chatSession,
  uiState,
}: BuildMessageListPropsOptions) {
  return {
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
    onRetryMessage: (
      message: Parameters<typeof chatSession.handleRetryAssistant>[0],
    ) => void chatSession.handleRetryAssistant(message),
    onRegenerateMessage: (
      message: Parameters<typeof chatSession.handleRegenerateAssistant>[0],
    ) => void chatSession.handleRegenerateAssistant(message),
  }
}

interface BuildComposerPropsOptions {
  activeConversationId: Conversation['id'] | null
  chatSession: ChatSessionController
}

export function buildComposerProps({
  activeConversationId,
  chatSession,
}: BuildComposerPropsOptions) {
  return {
    activeConversationId,
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
    onSubmit: (
      event: Parameters<typeof chatSession.handleSubmit>[0],
    ) => void chatSession.handleSubmit(event),
    onFilesSelected: (files: File[]) => void chatSession.handleFilesSelected(files),
    onRemoveAttachment: chatSession.removeSelectedAttachment,
  }
}

interface BuildOverlayPropsOptions {
  displayConversation: Conversation | null
  chatSession: ChatSessionController
  conversationList: ConversationListController
  providerSettings: ProviderSettingsController
  agentWorkspace: AgentWorkspaceController
  uiState: ChatUIStateController
  actions: ChatPageActionsController
  isSavingSettings: boolean
}

export function buildChatOverlaysProps({
  displayConversation,
  chatSession,
  conversationList,
  providerSettings,
  agentWorkspace,
  uiState,
  actions,
  isSavingSettings,
}: BuildOverlayPropsOptions) {
  return {
    activeTab: uiState.activeSettingsTab,
    chatSettings: chatSession.chatSettingsDraft,
    confirmation: uiState.confirmation,
    conversationFolder: chatSession.conversationFolderDraft,
    conversationTags: chatSession.conversationTagsDraft,
    showArchived: conversationList.showArchived,
    availableFolders: conversationList.availableFolders,
    availableTags: conversationList.availableTags,
    selectedFolder: conversationList.selectedFolder,
    selectedTags: conversationList.selectedTags,
    knowledgeSpaceIds: chatSession.knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds: chatSession.pendingKnowledgeSpaceIds,
    editingProviderId: providerSettings.editingProviderId,
    isLoadingProviders: providerSettings.isLoadingProviders,
    isOpen: uiState.isSettingsOpen,
    isSaving: isSavingSettings,
    isImporting: chatSession.isImporting,
    isSavingProvider: providerSettings.isSavingProvider,
    isTestingProvider: providerSettings.isTestingProvider,
    messageCount: chatSession.messages.length,
    selectedConversationIds: conversationList.selectedConversationIds,
    selectionMode: conversationList.selectionMode,
    onExport: chatSession.handleExportConversation,
    onImport: (file: File) => void actions.handleImportConversation(file),
    onActivateProvider: providerSettings.handleActivateProvider,
    onCreateRAGProvider: agentWorkspace.createRAGProvider,
    onActivateRAGProvider: agentWorkspace.activateRAGProvider,
    onLoadKnowledgeDocuments: agentWorkspace.loadKnowledgeDocuments,
    onToggleKnowledgeSpace: (space: { id: number }) =>
      chatSession.toggleKnowledgeSpace(space.id),
    onCreateKnowledgeSpace: agentWorkspace.createKnowledgeSpace,
    onUpdateKnowledgeSpace: agentWorkspace.updateKnowledgeSpace,
    onDeleteKnowledgeSpace: agentWorkspace.deleteKnowledgeSpace,
    onCreateKnowledgeDocument: agentWorkspace.createKnowledgeDocument,
    onUpdateKnowledgeDocument: agentWorkspace.updateKnowledgeDocument,
    onDeleteKnowledgeDocument: agentWorkspace.deleteKnowledgeDocument,
    onUploadKnowledgeDocuments: agentWorkspace.uploadKnowledgeDocuments,
    onReplaceKnowledgeDocumentFile: agentWorkspace.replaceKnowledgeDocumentFile,
    onCloseConfirmation: () => uiState.setConfirmation(null),
    onClosePrompt: () => uiState.setPromptState(null),
    onCloseSettings: () => uiState.setIsSettingsOpen(false),
    onDeleteProvider: actions.handleDeleteProvider,
    onDismissToast: (toastId: number) => uiState.dismissToast(toastId),
    onPauseToast: uiState.pauseToast,
    onResumeToast: uiState.resumeToast,
    onEditProvider: providerSettings.handleEditProvider,
    onProviderFieldChange: providerSettings.handleProviderFieldChange,
    onProviderModelsChange: providerSettings.handleProviderModelsChange,
    onProviderTabChange: uiState.setActiveSettingsTab,
    onReset: chatSession.resetSettingsDraft,
    onResetProvider: providerSettings.handleStartNewProvider,
    onSave: actions.handleSaveSettings,
    onSaveProvider: providerSettings.handleSaveProvider,
    onStartNewProvider: providerSettings.handleStartNewProvider,
    onTestProvider: providerSettings.handleTestProvider,
    promptState: uiState.promptState,
    providerForm: providerSettings.providerForm,
    providerState: providerSettings.providerState,
    ragProviderState: agentWorkspace.ragProviders,
    knowledgeSpaces: agentWorkspace.knowledgeSpaces,
    knowledgeDocuments: agentWorkspace.knowledgeDocuments,
    transferConversation: displayConversation,
    settings: chatSession.settingsDraft,
    setChatSettings: chatSession.setChatSettingsDraft,
    setConversationFolder: chatSession.setConversationFolderDraft,
    setConversationTags: chatSession.setConversationTagsDraft,
    onToggleArchived: conversationList.setShowArchived,
    onSelectFolder: conversationList.setSelectedFolder,
    onToggleTag: conversationList.toggleSelectedTag,
    onSetSelectionMode: conversationList.setSelectionMode,
    onBulkMoveToFolder: actions.handleBulkMoveToFolder,
    onBulkAddTags: actions.handleBulkAddTags,
    onBulkRemoveTags: actions.handleBulkRemoveTags,
    setSettings: chatSession.setSettingsDraft,
    toasts: uiState.toasts,
  }
}

export function buildWorkspaceProps({
  user,
  t,
  uiState,
  chatErrorState,
  actions,
  navigateToAdmin,
  setIsComposerExpanded,
  viewModel,
  messageListProps,
  composerProps,
  composerToolTrigger,
  modelControl,
}: {
  user: { role?: string } | null
  t: I18nContextValue['t']
  uiState: ChatUIStateController
  chatErrorState: ChatErrorStateController
  actions: ChatPageActionsController
  navigateToAdmin: () => void
  setIsComposerExpanded: Dispatch<SetStateAction<boolean>>
  viewModel: ReturnType<typeof buildChatPageViewModel>
  messageListProps: ReturnType<typeof buildMessageListProps>
  composerProps: ReturnType<typeof buildComposerProps>
  composerToolTrigger: ReactNode
  modelControl: ReactNode
}) {
  return {
    appName: t('app.name'),
    openSidebarLabel: t('chat.openSidebar'),
    settingsLabel: t('chat.settings'),
    adminLabel: t('chat.admin'),
    headerTitle: viewModel.headerTitle,
    isHeroState: viewModel.isHeroState,
    isComposerExpanded: viewModel.effectiveComposerExpanded,
    chatError: chatErrorState.chatError,
    showAdminEntry: user?.role === 'admin',
    composerToolTrigger,
    modelControl,
    onDismissChatError: chatErrorState.clearChatError,
    onOpenSidebar: () => uiState.setSidebarOpen(true),
    onOpenSettings: () => actions.handleOpenSettings('chat'),
    onOpenAdmin: navigateToAdmin,
    onToggleComposerExpanded: setIsComposerExpanded,
    messageListProps,
    composerProps,
  }
}
