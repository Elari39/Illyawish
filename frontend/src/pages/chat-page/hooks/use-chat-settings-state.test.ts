import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ChatSettings,
  Conversation,
} from '../../../types/chat'
import { useChatSettingsState } from './use-chat-settings-state'

const chatApiMock = vi.hoisted(() => ({
  getChatSettings: vi.fn(),
  updateChatSettings: vi.fn(),
  updateConversation: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  chatApi: chatApiMock,
}))

const persistedChatSettings: ChatSettings = {
  globalPrompt: 'Saved global prompt',
  providerPresetId: 2,
  model: 'gpt-4.1-mini',
  temperature: 0.6,
  maxTokens: 512,
  contextWindowTurns: 8,
}

function createConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: 'conversation-1' as Conversation['id'],
    title: 'Conversation 1',
    isPinned: false,
    isArchived: false,
    folder: 'Existing folder',
    tags: ['existing'],
    workflowPresetId: 19,
    knowledgeSpaceIds: [7, 8],
    settings: {
      systemPrompt: 'Saved conversation prompt',
      providerPresetId: 11,
      model: 'saved-conversation-model',
      temperature: 0.4,
      maxTokens: 1024,
      contextWindowTurns: 12,
    },
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
    ...overrides,
  }
}

function createOptions(
  overrides: Partial<Parameters<typeof useChatSettingsState>[0]> = {},
) {
  const currentConversation = createConversation()

  return {
    activeConversationId: currentConversation.id,
    currentConversation,
    setChatError: vi.fn(),
    syncConversationIntoList: vi.fn(),
    t: ((key: string) => key) as Parameters<typeof useChatSettingsState>[0]['t'],
    ...overrides,
  }
}

describe('useChatSettingsState', () => {
  beforeEach(() => {
    chatApiMock.getChatSettings.mockReset()
    chatApiMock.updateChatSettings.mockReset()
    chatApiMock.updateConversation.mockReset()
    chatApiMock.getChatSettings.mockResolvedValue(persistedChatSettings)
  })

  it('submits workflow changes with the full conversation settings payload', async () => {
    const updatedConversation = createConversation({
      workflowPresetId: null,
      knowledgeSpaceIds: [],
      settings: {
        systemPrompt: 'New prompt',
        providerPresetId: null,
        model: 'new-model',
        temperature: 1.2,
        maxTokens: 2048,
        contextWindowTurns: 6,
      },
    })
    chatApiMock.updateChatSettings.mockResolvedValue(persistedChatSettings)
    chatApiMock.updateConversation.mockResolvedValue(updatedConversation)

    const { result } = renderHook(() => useChatSettingsState(createOptions()))

    await waitFor(() => {
      expect(result.current.chatSettingsDraft.globalPrompt).toBe('Saved global prompt')
    })

    act(() => {
      result.current.setConversationFolderDraft(createConversation().folder)
      result.current.setConversationTagsDraft(createConversation().tags.join(', '))
      result.current.setWorkflowPresetIdDraft(null)
      result.current.setKnowledgeSpaceIdsDraft([])
      result.current.setSettingsDraft({
        systemPrompt: 'New prompt',
        providerPresetId: null,
        model: 'new-model',
        temperature: 1.2,
        maxTokens: 2048,
        contextWindowTurns: 6,
      })
    })

    await act(async () => {
      await result.current.handleSaveSettings(vi.fn())
    })

    expect(chatApiMock.updateConversation).toHaveBeenCalledWith(
      'conversation-1',
      {
        workflowPresetId: null,
        settings: {
          systemPrompt: 'New prompt',
          providerPresetId: null,
          model: 'new-model',
          temperature: 1.2,
          maxTokens: 2048,
          contextWindowTurns: 6,
        },
      },
    )
  })

  it('optimistically toggles knowledge spaces for existing conversations and persists immediately', async () => {
    const syncConversationIntoList = vi.fn()
    const updatedConversation = createConversation({
      knowledgeSpaceIds: [7, 8, 9],
    })
    let resolveConversationUpdate: ((conversation: Conversation) => void) | null = null
    chatApiMock.updateConversation.mockImplementation(
      () => new Promise<Conversation>((resolve) => {
        resolveConversationUpdate = resolve
      }),
    )

    const { result } = renderHook(() =>
      useChatSettingsState(createOptions({ syncConversationIntoList })),
    )

    act(() => {
      result.current.syncSettingsDraft()
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8])

    act(() => {
      void result.current.toggleKnowledgeSpace(9)
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8, 9])
    expect(result.current.pendingKnowledgeSpaceIds).toEqual([9])

    expect(resolveConversationUpdate).not.toBeNull()
    await act(async () => {
      resolveConversationUpdate?.(updatedConversation)
      await Promise.resolve()
    })

    expect(chatApiMock.updateConversation).toHaveBeenCalledWith('conversation-1', {
      knowledgeSpaceIds: [7, 8, 9],
    })
    expect(syncConversationIntoList).toHaveBeenCalledWith(updatedConversation)
    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8, 9])
    expect(result.current.pendingKnowledgeSpaceIds).toEqual([])
    expect(result.current.pendingConversation).toEqual(updatedConversation)
  })

  it('rolls back optimistic knowledge changes when immediate persistence fails', async () => {
    const setChatError = vi.fn()
    let rejectConversationUpdate: ((error: Error) => void) | null = null
    chatApiMock.updateConversation.mockImplementationOnce(
      () => new Promise<Conversation>((_, reject) => {
        rejectConversationUpdate = reject
      }),
    )

    const { result } = renderHook(() =>
      useChatSettingsState(createOptions({ setChatError })),
    )

    act(() => {
      result.current.syncSettingsDraft()
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8])

    act(() => {
      void result.current.toggleKnowledgeSpace(9)
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8, 9])
    expect(result.current.pendingKnowledgeSpaceIds).toEqual([9])

    expect(rejectConversationUpdate).not.toBeNull()
    await act(async () => {
      rejectConversationUpdate?.(new Error('knowledge update failed'))
      await Promise.resolve()
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([7, 8])
    expect(result.current.pendingKnowledgeSpaceIds).toEqual([])
    expect(setChatError).toHaveBeenCalledWith('knowledge update failed')
  })

  it('keeps new-chat knowledge toggles local until a conversation exists', async () => {
    const { result } = renderHook(() =>
      useChatSettingsState(createOptions({
        activeConversationId: null,
        currentConversation: null,
      })),
    )

    await waitFor(() => {
      expect(result.current.chatSettingsDraft.globalPrompt).toBe('Saved global prompt')
    })

    await act(async () => {
      await result.current.toggleKnowledgeSpace(11)
    })

    expect(result.current.knowledgeSpaceIdsDraft).toEqual([11])
    expect(chatApiMock.updateConversation).not.toHaveBeenCalled()
  })

  it('does not resend already-applied knowledge changes during settings save', async () => {
    const updatedConversation = createConversation({
      workflowPresetId: null,
      knowledgeSpaceIds: [7, 8],
      settings: {
        systemPrompt: 'New prompt',
        providerPresetId: null,
        model: 'new-model',
        temperature: 1.2,
        maxTokens: 2048,
        contextWindowTurns: 6,
      },
    })
    chatApiMock.updateChatSettings.mockResolvedValue(persistedChatSettings)
    chatApiMock.updateConversation.mockResolvedValue(updatedConversation)

    const { result } = renderHook(() => useChatSettingsState(createOptions()))

    await waitFor(() => {
      expect(result.current.chatSettingsDraft.globalPrompt).toBe('Saved global prompt')
    })

    act(() => {
      result.current.syncSettingsDraft()
      result.current.setWorkflowPresetIdDraft(null)
      result.current.setSettingsDraft({
        systemPrompt: 'New prompt',
        providerPresetId: null,
        model: 'new-model',
        temperature: 1.2,
        maxTokens: 2048,
        contextWindowTurns: 6,
      })
    })

    await act(async () => {
      await result.current.handleSaveSettings(vi.fn())
    })

    expect(chatApiMock.updateConversation).toHaveBeenCalledWith('conversation-1', {
      workflowPresetId: null,
      settings: {
        systemPrompt: 'New prompt',
        providerPresetId: null,
        model: 'new-model',
        temperature: 1.2,
        maxTokens: 2048,
        contextWindowTurns: 6,
      },
    })
  })

  it('rolls back global settings when conversation save fails', async () => {
    const setChatError = vi.fn()
    const nextChatSettings: ChatSettings = {
      ...persistedChatSettings,
      globalPrompt: 'Edited global prompt',
      model: 'edited-model',
    }
    chatApiMock.updateChatSettings
      .mockResolvedValueOnce(nextChatSettings)
      .mockResolvedValueOnce(persistedChatSettings)
    chatApiMock.updateConversation.mockRejectedValueOnce(
      new Error('conversation update failed'),
    )

    const { result } = renderHook(() =>
      useChatSettingsState(createOptions({ setChatError })),
    )

    await waitFor(() => {
      expect(result.current.chatSettingsDraft.globalPrompt).toBe('Saved global prompt')
    })

    act(() => {
      result.current.setChatSettingsDraft(nextChatSettings)
      result.current.setSettingsDraft({
        systemPrompt: 'Edited conversation prompt',
        providerPresetId: 13,
        model: 'edited-conversation-model',
        temperature: 1.1,
        maxTokens: 1500,
        contextWindowTurns: 9,
      })
      result.current.setWorkflowPresetIdDraft(33)
      result.current.setKnowledgeSpaceIdsDraft([99])
      result.current.setConversationFolderDraft('Edited folder')
      result.current.setConversationTagsDraft('edited, tags')
    })

    await act(async () => {
      await result.current.handleSaveSettings(vi.fn())
    })

    expect(chatApiMock.updateChatSettings).toHaveBeenNthCalledWith(1, nextChatSettings)
    expect(chatApiMock.updateChatSettings).toHaveBeenNthCalledWith(2, persistedChatSettings)
    expect(setChatError).toHaveBeenCalledWith('conversation update failed')
    expect(result.current.chatSettingsDraft).toEqual(persistedChatSettings)
    expect(result.current.settingsDraft).toEqual(createConversation().settings)
    expect(result.current.workflowPresetIdDraft).toBe(createConversation().workflowPresetId)
    expect(result.current.knowledgeSpaceIdsDraft).toEqual(createConversation().knowledgeSpaceIds)
    expect(result.current.conversationFolderDraft).toBe(createConversation().folder)
    expect(result.current.conversationTagsDraft).toBe(createConversation().tags.join(', '))
  })
})
