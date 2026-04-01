import { Suspense, lazy } from 'react'
import type { ChatOverlaysProps } from './chat-overlays-types'

const SettingsPanel = lazy(async () => import('./settings-panel').then((module) => ({
  default: module.SettingsPanel,
})))
const ConfirmationDialog = lazy(async () => import('./confirmation-dialog').then((module) => ({
  default: module.ConfirmationDialog,
})))
const PromptDialog = lazy(async () => import('./prompt-dialog').then((module) => ({
  default: module.PromptDialog,
})))
const ToastViewport = lazy(async () => import('./toast-viewport').then((module) => ({
  default: module.ToastViewport,
})))

export function ChatOverlays({
  activeTab,
  confirmation,
  editingProviderId,
  chatNumericInputDrafts,
  chatSettings,
  conversationFolder,
  conversationTags,
  showArchived,
  availableFolders,
  availableTags,
  selectedFolder,
  selectedTags,
  knowledgeSpaceIds,
  pendingKnowledgeSpaceIds,
  isLoadingProviders,
  isOpen,
  isImporting,
  isSaving,
  isSavingProvider,
  isTestingProvider,
  messageCount,
  selectedConversationIds,
  selectionMode,
  promptState,
  providerForm,
  providerState,
  ragProviderState,
  knowledgeSpaces,
  knowledgeDocuments,
  settings,
  setChatSettings,
  onChatNumericInputChange,
  setConversationFolder,
  setConversationTags,
  onToggleArchived,
  onSelectFolder,
  onToggleTag,
  onSetSelectionMode,
  onBulkMoveToFolder,
  onBulkAddTags,
  onBulkRemoveTags,
  setSettings,
  transferConversation,
  toasts,
  onActivateProvider,
  onCloseConfirmation,
  onClosePrompt,
  onCloseSettings,
  onDeleteProvider,
  onDismissToast,
  onPauseToast,
  onResumeToast,
  onEditProvider,
  onExport,
  onImport,
  onProviderFieldChange,
  onProviderModelsChange,
  onProviderTabChange,
  onCreateRAGProvider,
  onActivateRAGProvider,
  onLoadKnowledgeDocuments,
  onToggleKnowledgeSpace,
  onCreateKnowledgeSpace,
  onUpdateKnowledgeSpace,
  onDeleteKnowledgeSpace,
  onCreateKnowledgeDocument,
  onUpdateKnowledgeDocument,
  onDeleteKnowledgeDocument,
  onUploadKnowledgeDocuments,
  onReplaceKnowledgeDocumentFile,
  onReset,
  onResetProvider,
  onSave,
  onSaveProvider,
  onStartNewProvider,
  onTestProvider,
}: ChatOverlaysProps) {
  const historyPanelProps = {
    availableFolders,
    availableTags,
    conversationFolder,
    conversationTags,
    messageCount,
    onBulkAddTags,
    onBulkMoveToFolder,
    onBulkRemoveTags,
    onExport,
    onImport,
    onSelectFolder,
    onSetSelectionMode,
    onToggleArchived,
    onToggleTag,
    selectedConversationIds,
    selectedFolder,
    selectedTags,
    selectionMode,
    setConversationFolder,
    setConversationTags,
    showArchived,
    transferConversation,
  }

  const chatPanelProps = {
    chatNumericInputDrafts,
    chatSettings,
    onChatNumericInputChange,
    onReset,
    onSave,
    settings,
    setChatSettings,
    setSettings,
  }

  const providerPanelProps = {
    editingProviderId,
    isLoadingProviders,
    isSavingProvider,
    isTestingProvider,
    onActivateProvider: (providerId: number) => void onActivateProvider(providerId),
    onDeleteProvider,
    onEditProvider,
    onProviderFieldChange,
    onProviderModelsChange,
    onResetProvider,
    onSaveProvider: () => void onSaveProvider(),
    onStartNewProvider,
    onTestProvider: () => void onTestProvider(),
    providerForm,
    providerState,
  }

  const ragPanelProps = {
    onActivateRAGProvider,
    onCreateRAGProvider,
    ragProviderState,
  }

  const knowledgePanelProps = {
    knowledgeDocuments,
    knowledgeSpaceIds,
    knowledgeSpaces,
    onCreateKnowledgeDocument,
    onCreateKnowledgeSpace,
    onDeleteKnowledgeDocument,
    onDeleteKnowledgeSpace,
    onLoadKnowledgeDocuments,
    onReplaceKnowledgeDocumentFile,
    onToggleKnowledgeSpace,
    onUpdateKnowledgeDocument,
    onUpdateKnowledgeSpace,
    onUploadKnowledgeDocuments,
    pendingKnowledgeSpaceIds,
  }

  const overlayDialogProps = {
    confirmation,
    onCloseConfirmation,
    onClosePrompt,
    promptState,
    toasts,
    onDismissToast,
    onPauseToast,
    onResumeToast,
  }

  return (
    <Suspense fallback={null}>
      <SettingsPanel
        activeTab={activeTab}
        isOpen={isOpen}
        isImporting={isImporting}
        isSaving={isSaving}
        onClose={onCloseSettings}
        onProviderTabChange={onProviderTabChange}
        {...chatPanelProps}
        {...historyPanelProps}
        {...providerPanelProps}
        {...ragPanelProps}
        {...knowledgePanelProps}
      />
      <ConfirmationDialog
        confirmation={overlayDialogProps.confirmation}
        onClose={overlayDialogProps.onCloseConfirmation}
      />
      <PromptDialog
        promptState={overlayDialogProps.promptState}
        onClose={overlayDialogProps.onClosePrompt}
      />
      <ToastViewport
        toasts={overlayDialogProps.toasts}
        onDismiss={overlayDialogProps.onDismissToast}
        onPause={overlayDialogProps.onPauseToast}
        onResume={overlayDialogProps.onResumeToast}
      />
    </Suspense>
  )
}
