import { createRef } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Conversation } from '../../../types/chat'
import { useChatSession } from './use-chat-session'

const hookMocks = vi.hoisted(() => ({
  useChatComposerState: vi.fn(),
  useChatMessagesState: vi.fn(),
  useChatSettingsState: vi.fn(),
  useChatHistory: vi.fn(),
  useChatTransfer: vi.fn(),
  useChatGeneration: vi.fn(),
}))

const composerState = {
  composerFormRef: createRef<HTMLFormElement>(),
  fileInputRef: createRef<HTMLInputElement>(),
  composerIsComposingRef: { current: false },
  composerValue: '',
  selectedAttachments: [],
  editingMessageId: null,
  hasPendingUploads: false,
  setComposerValue: vi.fn(),
  clearEditingMessage: vi.fn(),
  cancelEditingMessage: vi.fn(),
  handleFilesSelected: vi.fn(),
  removeSelectedAttachment: vi.fn(),
  resetComposer: vi.fn(),
  startEditingMessage: vi.fn(),
}

const messagesState = {
  messageViewportRef: createRef<HTMLDivElement>(),
  messages: [],
  isLoadingMessages: false,
  isSending: false,
  latestUserMessage: null,
  latestAssistantMessage: null,
  setMessages: vi.fn(),
  setIsLoadingMessages: vi.fn(),
  setIsSending: vi.fn(),
}

const settingsState = {
  chatSettingsDraft: {
    globalPrompt: '',
    providerPresetId: null,
    model: '',
    temperature: 1,
    maxTokens: 0,
    contextWindowTurns: null,
  },
  conversationFolderDraft: '',
  conversationTagsDraft: '',
  workflowPresetIdDraft: null,
  knowledgeSpaceIdsDraft: [],
  pendingKnowledgeSpaceIds: [11],
  pendingConversation: null,
  settingsDraft: {
    systemPrompt: '',
    providerPresetId: null,
    model: '',
    temperature: 1,
    maxTokens: 0,
    contextWindowTurns: null,
  },
  setChatSettingsDraft: vi.fn(),
  setConversationFolderDraft: vi.fn(),
  setConversationTagsDraft: vi.fn(),
  setWorkflowPresetIdDraft: vi.fn(),
  setKnowledgeSpaceIdsDraft: vi.fn(),
  setPendingConversation: vi.fn(),
  setSettingsDraft: vi.fn(),
  applyChatSettings: vi.fn(),
  toggleKnowledgeSpace: vi.fn(),
  handleSaveSettings: vi.fn(),
  resetForNewChatSettings: vi.fn(),
  resetSettingsDraft: vi.fn(),
  syncSettingsDraft: vi.fn(),
}

const historyState = {
  hasMoreMessages: false,
  nextBeforeMessageId: null,
  isLoadingOlderMessages: false,
  loadOlderMessages: vi.fn(),
  resetHistoryState: vi.fn(),
  reconcileConversationState: vi.fn(),
  waitForConversationToSettle: vi.fn(),
}

const transferState = {
  isImporting: false,
  cleanupEmptyCreatedConversation: vi.fn(),
  handleExportConversation: vi.fn(),
  handleImportConversation: vi.fn(),
  resetForNewChat: vi.fn(),
}

const generationState = {
  executionEvents: [],
  pendingConfirmationId: null,
  handleRegenerateAssistant: vi.fn(),
  handleRetryAssistant: vi.fn(),
  handleConfirmToolCall: vi.fn(),
  handleStopGeneration: vi.fn(),
  handleSubmit: vi.fn(),
}

vi.mock('./use-chat-composer-state', () => ({
  useChatComposerState: hookMocks.useChatComposerState,
}))

vi.mock('./use-chat-messages-state', () => ({
  useChatMessagesState: hookMocks.useChatMessagesState,
}))

vi.mock('./use-chat-settings-state', () => ({
  useChatSettingsState: hookMocks.useChatSettingsState,
}))

vi.mock('./use-chat-history', () => ({
  useChatHistory: hookMocks.useChatHistory,
}))

vi.mock('./use-chat-transfer', () => ({
  useChatTransfer: hookMocks.useChatTransfer,
}))

vi.mock('./use-chat-generation', () => ({
  useChatGeneration: hookMocks.useChatGeneration,
}))

function createConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: 'conversation-1' as Conversation['id'],
    title: 'Conversation 1',
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [],
    workflowPresetId: null,
    knowledgeSpaceIds: [],
    settings: {
      systemPrompt: '',
      providerPresetId: null,
      model: '',
      temperature: 1,
      maxTokens: 0,
      contextWindowTurns: null,
    },
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
    ...overrides,
  }
}

describe('useChatSession', () => {
  it('exposes pending knowledge space ids from settings state', () => {
    hookMocks.useChatComposerState.mockReturnValue(composerState)
    hookMocks.useChatMessagesState.mockReturnValue(messagesState)
    hookMocks.useChatSettingsState.mockReturnValue(settingsState)
    hookMocks.useChatHistory.mockReturnValue(historyState)
    hookMocks.useChatTransfer.mockReturnValue(transferState)
    hookMocks.useChatGeneration.mockReturnValue(generationState)

    const conversation = createConversation()

    const { result } = renderHook(() =>
      useChatSession({
        activeConversationId: conversation.id,
        currentConversation: conversation,
        search: '',
        showArchived: false,
        setChatError: vi.fn(),
        showToast: vi.fn(),
        insertCreatedConversation: vi.fn(),
        removeConversationFromList: vi.fn(),
        syncConversationIntoList: vi.fn(),
        loadConversations: vi.fn().mockResolvedValue(undefined),
        navigateToConversation: vi.fn(),
        navigateHome: vi.fn(),
        setSkipAutoResume: vi.fn(),
        t: ((key: string) => key) as Parameters<typeof useChatSession>[0]['t'],
        locale: 'ja-JP',
      }),
    )

    expect(result.current.pendingKnowledgeSpaceIds).toEqual([11])
    expect(hookMocks.useChatGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingKnowledgeSpaceIds: [11],
      }),
    )
  })
})
