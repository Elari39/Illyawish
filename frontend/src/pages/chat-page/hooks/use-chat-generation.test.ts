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
  id: number | string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id: String(id) as Conversation['id'],
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
    conversationId: '7',
    role,
    content: `${role}-${status}`,
    reasoningContent: '',
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
    window.sessionStorage.clear()
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
      '7',
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
      '7',
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
      '7',
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
      workflowPresetId: null,
      knowledgeSpaceIds: [],
      settings: {
        ...draftSettings,
        providerPresetId: null,
        model: 'draft-model',
        temperature: null,
        maxTokens: null,
        contextWindowTurns: null,
      },
    })
    expect(chatApiMock.streamMessage).toHaveBeenCalledWith(
      '21',
      expect.objectContaining({
        content: 'First message',
        options: createdConversation.settings,
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('ignores stream events after the user switches to another conversation', async () => {
    const activeConversationIdRef = { current: '7' }
    const setMessages = vi.fn()
    const initialOptions = createOptions({
      composerValue: 'First message',
      activeConversationId: '7',
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
    activeConversationIdRef.current = '9'
    rerender(createOptions({
      composerValue: 'First message',
      activeConversationId: '9',
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

  it('applies reasoning deltas only to the targeted streaming assistant message', async () => {
    const setMessages = vi.fn()
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined
    expect(onEvent).toBeTypeOf('function')
    const optimisticMessages = (setMessages.mock.calls[0]?.[0] as ((messages: Message[]) => Message[]))([])

    setMessages.mockClear()

    await act(async () => {
      await onEvent?.({
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: ' -> step 2',
      })
    })

    expect(setMessages).toHaveBeenCalled()
    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.reasoningContent).toBe('step 1 -> step 2')
    expect(updated[1]?.content).toBe('')
  })

  it('buffers assistant content after reasoning starts until reasoning completes', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const setMessages = vi.fn()
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined
    expect(onEvent).toBeTypeOf('function')
    const optimisticMessages = (setMessages.mock.calls[0]?.[0] as ((messages: Message[]) => Message[]))([])

    setMessages.mockClear()

    await act(async () => {
      await onEvent?.({
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
    })

    const callCountAfterReasoning = setMessages.mock.calls.length

    await act(async () => {
      await onEvent?.({
        type: 'message_delta',
        content: 'buffered answer',
      })
    })

    expect(setMessages).toHaveBeenCalledTimes(callCountAfterReasoning)

    await act(async () => {
      await onEvent?.({
        type: 'reasoning_done',
        content: 'step 1',
      })
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.reasoningContent).toBe('step 1')
    expect(updated[1]?.content).toBe('buffered answer')
    rafSpy.mockRestore()
  })

  it('preserves assistant content order when reasoning starts after a pending content delta', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    const setMessages = vi.fn()
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined
    expect(onEvent).toBeTypeOf('function')
    const optimisticMessages = (setMessages.mock.calls[0]?.[0] as ((messages: Message[]) => Message[]))([])

    setMessages.mockClear()

    await act(async () => {
      await onEvent?.({
        type: 'message_delta',
        content: 'A',
      })
      await onEvent?.({
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
      await onEvent?.({
        type: 'message_delta',
        content: 'B',
      })
      await onEvent?.({
        type: 'reasoning_done',
      })
    })

    const pendingFlush = rafCallbacks.shift()
    expect(pendingFlush).toBeTypeOf('function')

    await act(async () => {
      pendingFlush?.(0)
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.reasoningContent).toBe('step 1')
    expect(updated[1]?.content).toBe('AB')
    rafSpy.mockRestore()
  })

  it('flushes buffered assistant content on done even without reasoning_done', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const setMessages = vi.fn()
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined
    expect(onEvent).toBeTypeOf('function')
    const optimisticMessages = (setMessages.mock.calls[0]?.[0] as ((messages: Message[]) => Message[]))([])

    setMessages.mockClear()

    await act(async () => {
      await onEvent?.({
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
      await onEvent?.({
        type: 'message_delta',
        content: 'buffered answer',
      })
    })

    const callCountBeforeDone = setMessages.mock.calls.length

    await act(async () => {
      await onEvent?.({
        type: 'done',
      })
    })

    expect(setMessages.mock.calls.length).toBeGreaterThan(callCountBeforeDone)

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.reasoningContent).toBe('step 1')
    expect(updated[1]?.content).toBe('buffered answer')
    rafSpy.mockRestore()
  })

  it('persists execution events into sessionStorage as stream events arrive', async () => {
    chatApiMock.streamMessage.mockImplementation(
      async (
        _conversationId: string,
        _payload: unknown,
        onEvent: (event: MessageStreamEvent) => Promise<void>,
      ) => {
        await onEvent({
          type: 'run_started',
          metadata: {
            templateKey: 'knowledge_qa',
          },
        })
        await onEvent({
          type: 'retrieval_completed',
          stepName: 'retrieve_knowledge',
          citations: [
            {
              documentId: 1,
              documentName: 'OpenAI.md',
              chunkId: 1,
              snippet: 'snippet',
              sourceUri: '',
            },
          ],
          metadata: {
            resultCount: 1,
            knowledgeSpaceCount: 1,
          },
        })
        await onEvent({
          type: 'done',
        })
      },
    )

    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'Persist this run',
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(window.sessionStorage.getItem('aichat:execution-panel:7')).toBeTruthy()
    expect(JSON.parse(window.sessionStorage.getItem('aichat:execution-panel:7') ?? 'null')).toMatchObject({
      pendingConfirmationId: null,
      events: [
        {
          type: 'run_started',
        },
        {
          type: 'retrieval_completed',
          stepName: 'retrieve_knowledge',
        },
        {
          type: 'done',
        },
      ],
    })
  })

  it('restores persisted execution state when the same conversation hook remounts', async () => {
    window.sessionStorage.setItem(
      'aichat:execution-panel:7',
      JSON.stringify({
        pendingConfirmationId: 'confirm-1',
        events: [
          {
            type: 'run_started',
            metadata: {
              templateKey: 'knowledge_qa',
            },
          },
          {
            type: 'tool_call_confirmation_required',
            toolName: 'http_request',
            confirmationId: 'confirm-1',
          },
        ],
      }),
    )

    const { result } = renderHook(() => useChatGeneration(createOptions()))

    expect(result.current.executionEvents).toMatchObject([
      {
        type: 'run_started',
      },
      {
        type: 'tool_call_confirmation_required',
        confirmationId: 'confirm-1',
      },
    ])
    expect(result.current.pendingConfirmationId).toBe('confirm-1')
  })

  it('clears restored execution state when switching to a conversation without cache', async () => {
    window.sessionStorage.setItem(
      'aichat:execution-panel:7',
      JSON.stringify({
        pendingConfirmationId: null,
        events: [
          {
            type: 'run_started',
            metadata: {
              templateKey: 'knowledge_qa',
            },
          },
        ],
      }),
    )

    const { result, rerender } = renderHook(
      (options: ReturnType<typeof createOptions>) => useChatGeneration(options),
      {
        initialProps: createOptions(),
      },
    )

    expect(result.current.executionEvents).toHaveLength(1)

    await act(async () => {
      rerender(createOptions({
        activeConversationId: '9',
        currentConversation: createConversation(9),
        activeConversationIdRef: { current: '9' },
      }))
    })

    expect(result.current.executionEvents).toHaveLength(0)
    expect(result.current.pendingConfirmationId).toBeNull()
  })

  it('keeps persisting execution state for the generating conversation after navigating away', async () => {
    const activeConversationIdRef = { current: '7' }

    const { result, rerender } = renderHook(
      (options: ReturnType<typeof createOptions>) => useChatGeneration(options),
      {
        initialProps: createOptions({
          composerValue: 'First message',
          activeConversationId: '7',
          currentConversation: createConversation(7),
          activeConversationIdRef,
        }),
      },
    )

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const onEvent = chatApiMock.streamMessage.mock.calls[0]?.[2] as
      | ((event: MessageStreamEvent) => Promise<void>)
      | undefined

    activeConversationIdRef.current = '9'
    rerender(createOptions({
      composerValue: 'First message',
      activeConversationId: '9',
      currentConversation: createConversation(9),
      activeConversationIdRef,
    }))

    await act(async () => {
      await onEvent?.({
        type: 'tool_call_confirmation_required',
        toolName: 'http_request',
        confirmationId: 'confirm-background',
      })
    })

    expect(JSON.parse(window.sessionStorage.getItem('aichat:execution-panel:7') ?? 'null')).toMatchObject({
      pendingConfirmationId: 'confirm-background',
      events: [
        {
          type: 'tool_call_confirmation_required',
          confirmationId: 'confirm-background',
        },
      ],
    })
  })
})

type MessageStreamEvent = {
  type:
    | 'message_start'
    | 'delta'
    | 'message_delta'
    | 'reasoning_start'
    | 'reasoning_delta'
    | 'reasoning_done'
    | 'done'
    | 'cancelled'
    | 'error'
    | 'run_started'
    | 'retrieval_completed'
    | 'tool_call_confirmation_required'
  content?: string
  message?: Message
  error?: string
  stepName?: string
  toolName?: string
  confirmationId?: string
  metadata?: Record<string, unknown>
  citations?: Array<{
    documentId: number
    documentName: string
    chunkId: number
    snippet: string
    sourceUri: string
  }>
}
