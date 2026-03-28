import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useChatGeneration } from './use-chat-generation'
import type {
  Conversation,
  ConversationSettings,
  Message,
} from '../../../types/chat'

const chatApiMock = vi.hoisted(() => ({
  createConversation: vi.fn(),
  streamMessage: vi.fn(),
  retryMessage: vi.fn(),
  regenerateMessage: vi.fn(),
  editMessage: vi.fn(),
  cancelGeneration: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  chatApi: chatApiMock,
}))

const savedSettings: ConversationSettings = {
  systemPrompt: 'saved prompt',
  model: 'saved-model',
  temperature: 0.2,
  maxTokens: 256,
  contextWindowTurns: 8,
}

const draftSettings: ConversationSettings = {
  systemPrompt: 'draft prompt',
  model: 'draft-model',
  temperature: 1.7,
  maxTokens: 1024,
  contextWindowTurns: 2,
}

function createConversation(
  id: number,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [],
    settings: savedSettings,
    createdAt: '2026-03-26T09:08:00Z',
    updatedAt: '2026-03-26T09:08:00Z',
    ...overrides,
  }
}

function createMessage(
  id: number,
  role: Message['role'],
  status: Message['status'],
): Message {
  return {
    id,
    conversationId: 7,
    role,
    content: `${role}-${status}`,
    attachments: [],
    status,
    createdAt: '2026-03-26T09:08:00Z',
  }
}

function createOptions(
  overrides: Partial<Parameters<typeof useChatGeneration>[0]> = {},
) {
  const currentConversation = createConversation(7)

  return {
    activeConversationId: currentConversation.id,
    currentConversation,
    composerValue: 'Edited content',
    selectedAttachments: [],
    editingMessageId: null,
    conversationFolderDraft: '',
    conversationTagsDraft: '',
    settingsDraft: draftSettings,
    setChatError: vi.fn(),
    t: ((key: string) => key) as Parameters<typeof useChatGeneration>[0]['t'],
    insertCreatedConversation: vi.fn(),
    loadConversations: vi.fn().mockResolvedValue(undefined),
    navigateToConversation: vi.fn(),
    setPendingConversation: vi.fn(),
    setMessages: vi.fn(),
    setIsSending: vi.fn(),
    resetComposer: vi.fn(),
    activeConversationIdRef: { current: currentConversation.id },
    activeGenerationRef: { current: null },
    nextGenerationIdRef: { current: 0 },
    reconcileConversationState: vi.fn().mockResolvedValue(null),
    waitForConversationToSettle: vi.fn().mockResolvedValue(null),
    cleanupEmptyCreatedConversation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('useChatGeneration saved settings behavior', () => {
  beforeEach(() => {
    for (const mockFn of Object.values(chatApiMock)) {
      mockFn.mockReset()
    }

    chatApiMock.retryMessage.mockResolvedValue(undefined)
    chatApiMock.regenerateMessage.mockResolvedValue(undefined)
    chatApiMock.editMessage.mockResolvedValue(undefined)
    chatApiMock.streamMessage.mockResolvedValue(undefined)
    chatApiMock.createConversation.mockResolvedValue(createConversation(21, {
      settings: {
        systemPrompt: 'new chat saved prompt',
        model: '',
        temperature: 0.4,
        maxTokens: 512,
        contextWindowTurns: 5,
      },
    }))
  })

  it('uses saved conversation settings for retry instead of unsaved drafts', async () => {
    const { result } = renderHook(() => useChatGeneration(createOptions()))

    await act(async () => {
      await result.current.handleRetryAssistant(
        createMessage(31, 'assistant', 'failed'),
      )
    })

    expect(chatApiMock.retryMessage).toHaveBeenCalledWith(
      7,
      31,
      savedSettings,
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('uses saved conversation settings for regenerate instead of unsaved drafts', async () => {
    const { result } = renderHook(() => useChatGeneration(createOptions()))

    await act(async () => {
      await result.current.handleRegenerateAssistant(
        createMessage(41, 'assistant', 'completed'),
      )
    })

    expect(chatApiMock.regenerateMessage).toHaveBeenCalledWith(
      7,
      41,
      savedSettings,
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('uses saved conversation settings for edit instead of unsaved drafts', async () => {
    const options = createOptions({
      editingMessageId: 51,
      composerValue: 'Edited content',
    })
    const { result } = renderHook(() => useChatGeneration(options))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(chatApiMock.editMessage).toHaveBeenCalledWith(
      7,
      51,
      expect.objectContaining({
        content: 'Edited content',
        options: savedSettings,
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('uses the saved next-chat settings returned from conversation creation for the first stream', async () => {
    const createdConversation = createConversation(21, {
      settings: {
        systemPrompt: 'new chat saved prompt',
        model: '',
        temperature: 0.4,
        maxTokens: 512,
        contextWindowTurns: 5,
      },
    })
    chatApiMock.createConversation.mockResolvedValue(createdConversation)

    const { result } = renderHook(() => useChatGeneration(createOptions({
      activeConversationId: null,
      currentConversation: null,
      activeConversationIdRef: { current: null },
      composerValue: 'First message',
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(chatApiMock.createConversation).toHaveBeenCalledWith({
      settings: {
        ...draftSettings,
        model: '',
        temperature: null,
        maxTokens: null,
        contextWindowTurns: null,
      },
    })
    expect(chatApiMock.streamMessage).toHaveBeenCalledWith(
      21,
      expect.objectContaining({
        content: 'First message',
        options: createdConversation.settings,
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('ignores stream events after the user switches to another conversation', async () => {
    const activeConversationIdRef = { current: 7 }
    const setMessages = vi.fn()
    const initialOptions = createOptions({
      composerValue: 'First message',
      activeConversationId: 7,
      currentConversation: createConversation(7),
      activeConversationIdRef,
      setMessages,
    })

    const { result, rerender } = renderHook(
      (options: ReturnType<typeof createOptions>) => useChatGeneration(options),
      { initialProps: initialOptions },
    )

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined
    expect(onEvent).toBeTypeOf('function')

    setMessages.mockClear()
    activeConversationIdRef.current = 9
    rerender(createOptions({
      composerValue: 'First message',
      activeConversationId: 9,
      currentConversation: createConversation(9),
      activeConversationIdRef,
      setMessages,
    }))

    await act(async () => {
      await onEvent?.({
        type: 'delta',
        content: 'late chunk',
      })
    })

    expect(setMessages).not.toHaveBeenCalled()
  })
})

type MessageStreamEvent = {
  type: 'message_start' | 'delta' | 'done' | 'cancelled' | 'error'
  content?: string
  message?: Message
  error?: string
}
