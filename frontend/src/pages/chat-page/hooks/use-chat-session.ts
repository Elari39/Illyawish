import { useRef } from 'react'

import type { I18nContextValue } from '../../../i18n/context'
import type { Conversation } from '../../../types/chat'
import type { ToastVariant } from '../types'
import { useChatComposerState } from './use-chat-composer-state'
import { useChatGeneration, type ActiveGenerationState } from './use-chat-generation'
import { useChatHistory } from './use-chat-history'
import { useChatMessagesState } from './use-chat-messages-state'
import { useChatSettingsState } from './use-chat-settings-state'
import { useChatTransfer } from './use-chat-transfer'

interface UseChatSessionOptions {
  activeConversationId: Conversation['id'] | null
  currentConversation: Conversation | null
  search: string
  showArchived: boolean
  setChatError: (value: string | null) => void
  showToast: (message: string, variant?: ToastVariant) => void
  insertCreatedConversation: (conversation: Conversation) => void
  removeConversationFromList: (conversationId: Conversation['id']) => void
  syncConversationIntoList: (
    conversation: Conversation,
    options?: { updateCountsForVisibilityChange?: boolean },
  ) => void
  loadConversations: (options?: { append?: boolean }) => Promise<void>
  navigateToConversation: (conversationId: Conversation['id'], replace?: boolean) => void
  navigateHome: (replace?: boolean) => void
  setSkipAutoResume: (value: boolean) => void
  t: I18nContextValue['t']
  locale: string
}

export function useChatSession({
  activeConversationId,
  currentConversation,
  search,
  showArchived,
  setChatError,
  showToast,
  insertCreatedConversation,
  removeConversationFromList,
  syncConversationIntoList,
  loadConversations,
  navigateToConversation,
  navigateHome,
  setSkipAutoResume,
  t,
  locale,
}: UseChatSessionOptions) {
  const activeGenerationRef = useRef<ActiveGenerationState | null>(null)
  const nextGenerationIdRef = useRef(0)
  const activeConversationIdRef = useRef<Conversation['id'] | null>(null)

  const {
    composerFormRef,
    fileInputRef,
    composerIsComposingRef,
    composerValue,
    selectedAttachments,
    editingMessageId,
    hasPendingUploads,
    setComposerValue,
    clearEditingMessage,
    cancelEditingMessage,
    handleFilesSelected,
    removeSelectedAttachment,
    resetComposer,
    startEditingMessage,
  } = useChatComposerState({
    setChatError,
    showToast,
    t,
  })
  const {
    messageViewportRef,
    messages,
    isLoadingMessages,
    isSending,
    latestUserMessage,
    latestAssistantMessage,
    skipNextMessageAutoScroll,
    setMessages,
    setIsLoadingMessages,
    setIsSending,
  } = useChatMessagesState()
  const {
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    workflowPresetIdDraft,
    knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds,
    pendingConversation,
    settingsDraft,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setWorkflowPresetIdDraft,
    setKnowledgeSpaceIdsDraft,
    setPendingConversation,
    setSettingsDraft,
    applyChatSettings,
    toggleKnowledgeSpace,
    handleSaveSettings,
    resetForNewChatSettings,
    resetSettingsDraft,
    syncSettingsDraft,
  } = useChatSettingsState({
    activeConversationId,
    currentConversation,
    setChatError,
    syncConversationIntoList,
    t,
  })

  const history = useChatHistory({
    activeConversationId,
    search,
    showArchived,
    setChatError,
    syncConversationIntoList,
    navigateHome,
    setSkipAutoResume,
    t,
    activeConversationIdRef,
    activeGenerationRef,
    messageViewportRef,
    clearEditingMessage,
    resetForNewChatSettings,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setPendingConversation,
    setSettingsDraft,
    setMessages,
    setIsLoadingMessages,
    setIsSending,
    skipNextMessageAutoScroll,
  })

  const transfer = useChatTransfer({
    currentConversation,
    pendingConversation,
    messages,
    locale,
    t,
    setChatError,
    showToast,
    insertCreatedConversation,
    removeConversationFromList,
    loadConversations,
    navigateToConversation,
    navigateHome,
    setSkipAutoResume,
    activeConversationIdRef,
    setPendingConversation,
    setMessages,
    resetForNewChatSettings,
    resetComposer,
    resetHistoryState: history.resetHistoryState,
    reconcileConversationState: history.reconcileConversationState,
  })

  const generation = useChatGeneration({
    activeConversationId,
    currentConversation,
    composerValue,
    selectedAttachments,
    editingMessageId,
    conversationFolderDraft,
    conversationTagsDraft,
    workflowPresetIdDraft,
    knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds,
    settingsDraft,
    setChatError,
    t,
    insertCreatedConversation,
    loadConversations,
    navigateToConversation,
    setPendingConversation,
    setMessages,
    setIsSending,
    resetComposer,
    activeConversationIdRef,
    activeGenerationRef,
    nextGenerationIdRef,
    reconcileConversationState: history.reconcileConversationState,
    waitForConversationToSettle: history.waitForConversationToSettle,
    cleanupEmptyCreatedConversation: transfer.cleanupEmptyCreatedConversation,
  })

  const canSubmitComposer =
    !isSending &&
    !hasPendingUploads &&
    (composerValue.trim().length > 0 || selectedAttachments.length > 0)

  return {
    composerFormRef,
    fileInputRef,
    messageViewportRef,
    composerIsComposingRef,
    messages,
    composerValue,
    chatSettingsDraft,
    conversationFolderDraft,
    conversationTagsDraft,
    workflowPresetIdDraft,
    knowledgeSpaceIdsDraft,
    pendingKnowledgeSpaceIds,
    selectedAttachments,
    settingsDraft,
    pendingConversation,
    editingMessageId,
    isLoadingMessages,
    isSending,
    isImporting: transfer.isImporting,
    executionEvents: generation.executionEvents,
    pendingConfirmationId: generation.pendingConfirmationId,
    hasMoreMessages: history.hasMoreMessages,
    nextBeforeMessageId: history.nextBeforeMessageId,
    isLoadingOlderMessages: history.isLoadingOlderMessages,
    latestUserMessage,
    latestAssistantMessage,
    hasPendingUploads,
    canSubmitComposer,
    setComposerValue,
    setChatSettingsDraft,
    setConversationFolderDraft,
    setConversationTagsDraft,
    setWorkflowPresetIdDraft,
    setKnowledgeSpaceIdsDraft,
    setSettingsDraft,
    applyChatSettings,
    toggleKnowledgeSpace,
    resetSettingsDraft,
    syncSettingsDraft,
    handleExportConversation: transfer.handleExportConversation,
    handleImportConversation: transfer.handleImportConversation,
    loadOlderMessages: history.loadOlderMessages,
    handleFilesSelected,
    handleRegenerateAssistant: generation.handleRegenerateAssistant,
    handleRetryAssistant: generation.handleRetryAssistant,
    handleConfirmToolCall: generation.handleConfirmToolCall,
    handleSaveSettings,
    handleStopGeneration: generation.handleStopGeneration,
    handleSubmit: generation.handleSubmit,
    removeSelectedAttachment,
    resetForNewChat: transfer.resetForNewChat,
    startEditingMessage,
    cancelEditingMessage,
  }
}
