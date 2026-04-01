import { createEditSubmitHandler } from './chat-generation/edit'
import { createRegenerateAssistantHandler } from './chat-generation/regenerate'
import { createResumeConversationHandler } from './chat-generation/resume'
import { createRetryAssistantHandler } from './chat-generation/retry'
import { createSendSubmitHandler, createSubmitHandler } from './chat-generation/submit'
import { createStopGenerationHandler } from './chat-generation/stop'
import type {
  ChatGenerationWorkflowContext,
  UseChatGenerationOptions,
} from './chat-generation/types'
import { useChatGenerationStreamState } from './use-chat-generation-stream-state'

export function useChatGeneration({
  activeConversationId,
  currentConversation,
  messages,
  composerValue,
  selectedAttachments,
  editingMessageId,
  conversationFolderDraft,
  conversationTagsDraft,
  knowledgeSpaceIdsDraft = [],
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
  skipNextConversationSyncRef,
  nextGenerationIdRef,
  reconcileConversationState,
  waitForConversationToSettle,
  cleanupEmptyCreatedConversation,
}: UseChatGenerationOptions) {
  const {
    flushActiveMessageDelta,
    handleStreamEventForConversation,
    readLastEventSeq,
    resetExecutionState,
  } = useChatGenerationStreamState({
    activeConversationId,
    activeConversationIdRef,
    activeGenerationRef,
    setMessages,
    setChatError,
    t,
  })
  const workflowContext: ChatGenerationWorkflowContext = {
    activeConversationId,
    currentConversation,
    messages,
    composerValue,
    selectedAttachments,
    editingMessageId,
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft,
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
    skipNextConversationSyncRef,
    nextGenerationIdRef,
    reconcileConversationState,
    waitForConversationToSettle,
    cleanupEmptyCreatedConversation,
    flushActiveMessageDelta,
    handleStreamEventForConversation,
    readLastEventSeq,
    resetExecutionState,
  }

  const handleSendSubmit = createSendSubmitHandler(workflowContext)
  const handleEditSubmit = createEditSubmitHandler(workflowContext)
  const handleRetryAssistant = createRetryAssistantHandler(workflowContext)
  const handleRegenerateAssistant =
    createRegenerateAssistantHandler(workflowContext)
  const handleStopGeneration = createStopGenerationHandler(workflowContext)
  const handleResumeConversation =
    createResumeConversationHandler(workflowContext)
  const handleSubmit = createSubmitHandler({
    context: workflowContext,
    handleEditSubmit,
    handleSendSubmit,
  })

  return {
    handleResumeConversation,
    handleRetryAssistant,
    handleRegenerateAssistant,
    handleStopGeneration,
    handleSubmit,
  }
}
