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
  resumeStream: vi.fn(),
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

function applyMessageUpdaters(
  updates: unknown[],
  initialMessages: Message[] = [],
) {
  return updates.reduce<Message[]>((messages, update) => (
    typeof update === 'function'
      ? (update as (messages: Message[]) => Message[])(messages)
      : (update as Message[])
  ), initialMessages)
}

function createOptions(
  overrides: Partial<Parameters<typeof useChatGeneration>[0]> = {},
) {
  const currentConversation = createConversation(7)
  const activeConversationId =
    overrides.activeConversationId === undefined
      ? currentConversation.id
      : overrides.activeConversationId

  return {
    activeConversationId,
    currentConversation,
    messages: [],
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
    skipNextConversationSyncRef: { current: null },
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
    chatApiMock.resumeStream.mockResolvedValue(undefined)
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
    const failedAssistant = createMessage(31, 'assistant', 'failed')
    const { result } = renderHook(() => useChatGeneration(createOptions({
      messages: [createMessage(30, 'user', 'completed'), failedAssistant],
    })))

    await act(async () => {
      await result.current.handleRetryAssistant(failedAssistant)
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
    const completedAssistant = createMessage(41, 'assistant', 'completed')
    const { result } = renderHook(() => useChatGeneration(createOptions({
      messages: [createMessage(40, 'user', 'completed'), completedAssistant],
    })))

    await act(async () => {
      await result.current.handleRegenerateAssistant(completedAssistant)
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
      messages: [
        createMessage(50, 'user', 'completed'),
        createMessage(51, 'user', 'completed'),
        createMessage(52, 'assistant', 'completed'),
      ],
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

  it('uses the submitted draft settings for new conversation creation and the first stream', async () => {
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
      knowledgeSpaceIds: [],
      settings: {
        ...draftSettings,
        providerPresetId: null,
      },
    })
    expect(chatApiMock.streamMessage).toHaveBeenCalledWith(
      '21',
      expect.objectContaining({
        content: 'First message',
        knowledgeSpaceIds: [],
        options: {
          ...draftSettings,
          providerPresetId: null,
        },
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(chatApiMock.streamMessage.mock.calls[0]?.[1]).not.toHaveProperty('workflowPresetId')
  })

  it('starts generation before navigating when sending the first message in a new conversation', async () => {
    const activeGenerationRef = { current: null }
    const navigateToConversation = vi.fn(() => {
      expect(activeGenerationRef.current).toMatchObject({
        conversationId: '21',
      })
    })
    const { result } = renderHook(() => useChatGeneration(createOptions({
      activeConversationId: null,
      currentConversation: null,
      activeConversationIdRef: { current: null },
      activeGenerationRef,
      composerValue: 'First message',
      navigateToConversation,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(navigateToConversation).toHaveBeenCalledWith('21')
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

  it('replaces the optimistic assistant placeholder when message_start provides the server message id', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    const setMessages = vi.fn()
    chatApiMock.streamMessage.mockImplementation(
      async (
        _conversationId: string,
        _payload: unknown,
        onEvent: (event: MessageStreamEvent) => Promise<void>,
      ) => {
        await onEvent({
          type: 'message_start',
          message: {
            ...createMessage(99, 'assistant', 'streaming'),
            content: '',
          },
        })
        await onEvent({
          type: 'message_delta',
          content: 'step 1 -> step 2',
        })
      },
    )
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    expect(setMessages).toHaveBeenCalled()
    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), [] as Message[])
    const streamedAssistant = updated.find((message) => message.id === 99)

    expect(streamedAssistant).toMatchObject({
      id: 99,
      role: 'assistant',
      status: 'streaming',
    })
    rafSpy.mockRestore()
  })

  it('buffers assistant content until the animation frame flushes', async () => {
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
        content: 'buffered answer',
      })
    })

    expect(setMessages).not.toHaveBeenCalled()
    expect(rafCallbacks).toHaveLength(1)

    await act(async () => {
      rafCallbacks[0]?.(0)
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.content).toBe('buffered answer')
    rafSpy.mockRestore()
  })

  it('buffers assistant reasoning separately before the animation frame flushes', async () => {
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
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
      await onEvent?.({
        type: 'delta',
        content: 'final answer',
      })
    })

    const beforeFlush = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(beforeFlush[1]).toMatchObject({
      reasoningContent: '',
      localReasoningStartedAt: expect.any(Number),
    })
    expect(rafCallbacks).toHaveLength(1)

    await act(async () => {
      rafCallbacks[0]?.(0)
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]).toMatchObject({
      reasoningContent: 'step 1',
      content: 'final answer',
    })
    rafSpy.mockRestore()
  })

  it('preserves assistant content order across multiple buffered deltas', async () => {
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
        type: 'message_delta',
        content: 'B',
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

    expect(updated[1]?.content).toBe('AB')
    rafSpy.mockRestore()
  })

  it('flushes buffered assistant content on done', async () => {
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
        content: 'buffered answer',
      })
    })

    expect(setMessages).not.toHaveBeenCalled()
    expect(rafCallbacks).toHaveLength(1)

    await act(async () => {
      await onEvent?.({
        type: 'done',
      })
    })

    expect(setMessages).toHaveBeenCalled()

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])

    expect(updated[1]?.content).toBe('buffered answer')
    rafSpy.mockRestore()
  })

  it('uses the final server message to replace buffered reasoning and content on done', async () => {
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
        type: 'reasoning_delta',
        content: 'partial reasoning',
      })
      await onEvent?.({
        type: 'delta',
        content: 'partial answer',
      })
      await onEvent?.({
        type: 'done',
        message: {
          ...createMessage(99, 'assistant', 'completed'),
          content: 'final answer',
          reasoningContent: 'final reasoning',
        },
      })
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])
    const finalAssistant = updated.find((message) => message.id === 99)

    expect(finalAssistant).toMatchObject({
      id: 99,
      status: 'completed',
      reasoningContent: 'final reasoning',
      content: 'final answer',
    })
    rafSpy.mockRestore()
  })

  it('records observable reasoning timings locally and preserves them when the final server message replaces the placeholder', async () => {
    vi.useFakeTimers()
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

    vi.setSystemTime(new Date('2026-03-26T09:08:02Z'))
    await act(async () => {
      await onEvent?.({
        type: 'reasoning_start',
      })
      await onEvent?.({
        type: 'reasoning_delta',
        content: 'step 1',
      })
    })

    vi.setSystemTime(new Date('2026-03-26T09:08:20Z'))
    await act(async () => {
      await onEvent?.({
        type: 'reasoning_done',
      })
      await onEvent?.({
        type: 'done',
        message: {
          ...createMessage(99, 'assistant', 'completed'),
          content: 'final answer',
          reasoningContent: 'final reasoning',
        },
      })
    })

    const updated = setMessages.mock.calls.reduce((messages, [updater]) => (
      typeof updater === 'function' ? updater(messages) : updater
    ), optimisticMessages as Message[])
    const finalAssistant = updated.find((message) => message.id === 99)

    expect(finalAssistant).toMatchObject({
      id: 99,
      status: 'completed',
      localReasoningStartedAt: new Date('2026-03-26T09:08:02Z').getTime(),
      localReasoningCompletedAt: new Date('2026-03-26T09:08:20Z').getTime(),
    })
  })

  it('clears local reasoning timings when regenerating an assistant reply', async () => {
    const completedAssistant: Message = {
      ...createMessage(41, 'assistant', 'completed'),
      localReasoningStartedAt: 1000,
      localReasoningCompletedAt: 2000,
      reasoningContent: 'old reasoning',
      content: 'old answer',
    }
    const setMessages = vi.fn()
    const { result } = renderHook(() => useChatGeneration(createOptions({
      messages: [createMessage(40, 'user', 'completed'), completedAssistant],
      setMessages,
    })))

    await act(async () => {
      await result.current.handleRegenerateAssistant(completedAssistant)
    })

    const updated = applyMessageUpdaters(
      setMessages.mock.calls.map(([updater]) => updater),
      [createMessage(40, 'user', 'completed'), completedAssistant],
    )

    expect(updated[1]).toMatchObject({
      id: 41,
      status: 'streaming',
      reasoningContent: '',
      content: '',
    })
    expect(updated[1]?.localReasoningStartedAt).toBeUndefined()
    expect(updated[1]?.localReasoningCompletedAt).toBeUndefined()
  })

  it('persists only the last stream sequence into sessionStorage as events arrive', async () => {
    chatApiMock.streamMessage.mockImplementation(
      async (
        _conversationId: string,
        _payload: unknown,
        onEvent: (event: MessageStreamEvent) => Promise<void>,
      ) => {
        await onEvent({
          type: 'message_start',
          seq: 1,
          message: createMessage(91, 'assistant', 'streaming'),
        })
        await onEvent({
          type: 'message_delta',
          seq: 2,
          content: 'hello',
        })
        await onEvent({
          type: 'done',
          seq: 3,
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

    expect(window.sessionStorage.getItem('aichat:stream-seq:7')).toBe('3')
  })

  it('resumes from the persisted last stream sequence for the same conversation', async () => {
    window.sessionStorage.setItem(
      'aichat:stream-seq:7',
      '3',
    )

    const { result } = renderHook(() => useChatGeneration(createOptions()))

    await act(async () => {
      await result.current.handleResumeConversation('7')
    })

    expect(chatApiMock.resumeStream).toHaveBeenCalledWith(
      '7',
      3,
      expect.any(Function),
      expect.any(AbortSignal),
    )
  })

  it('keeps persisting lastEventSeq for the generating conversation after navigating away', async () => {
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
        type: 'message_delta',
        seq: 4,
        content: 'background chunk',
      })
    })

    expect(window.sessionStorage.getItem('aichat:stream-seq:7')).toBe('4')
  })

  it('resumes a streaming conversation without surfacing a stopped error on disconnect', async () => {
    const setChatError = vi.fn()
    const setMessages = vi.fn()
    const reconcileConversationState = vi.fn().mockResolvedValue({
      conversation: createConversation(7),
      messages: [
        createMessage(1, 'user', 'completed'),
        {
          ...createMessage(2, 'assistant', 'streaming'),
          content: '',
        },
      ],
    })
    chatApiMock.resumeStream.mockImplementation(
      async (
        _conversationId: string,
        _afterSeq: number,
        onEvent: (event: MessageStreamEvent) => Promise<void>,
      ) => {
        await onEvent({
          type: 'cancelled',
          seq: 3,
          message: {
            ...createMessage(2, 'assistant', 'cancelled'),
            conversationId: '7',
          },
        })
      },
    )
    const { result } = renderHook(() => useChatGeneration(createOptions({
      setChatError,
      setMessages,
      reconcileConversationState,
    })))

    await act(async () => {
      await result.current.handleResumeConversation('7')
    })

    expect(chatApiMock.resumeStream).toHaveBeenCalledWith(
      '7',
      0,
      expect.any(Function),
      expect.any(AbortSignal),
    )

    expect(setChatError).not.toHaveBeenCalledWith('error.generationStopped')
  })

  it('preserves the optimistic user message and failed assistant when send fails', async () => {
    const setMessages = vi.fn()
    const reconcileConversationState = vi.fn().mockResolvedValue(null)
    chatApiMock.streamMessage.mockRejectedValue(new Error('send failed'))
    const { result } = renderHook(() => useChatGeneration(createOptions({
      composerValue: 'First message',
      setMessages,
      reconcileConversationState,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const preserveMessages = applyMessageUpdaters(
      setMessages.mock.calls.map(([updater]) => updater),
    )

    expect(reconcileConversationState).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({
        clearErrorOnSuccess: false,
        preserveMessages,
      }),
    )
    expect(preserveMessages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'First message',
        status: 'completed',
      }),
      expect.objectContaining({
        role: 'assistant',
        status: 'failed',
        content: 'error.completeReply',
      }),
    ])
  })

  it('preserves the edited user message and failed assistant when edit fails', async () => {
    const initialMessages = [
      createMessage(50, 'user', 'completed'),
      createMessage(51, 'user', 'completed'),
      createMessage(52, 'assistant', 'completed'),
    ]
    const setMessages = vi.fn()
    const reconcileConversationState = vi.fn().mockResolvedValue(null)
    chatApiMock.editMessage.mockRejectedValue(new Error('edit failed'))
    const { result } = renderHook(() => useChatGeneration(createOptions({
      editingMessageId: 51,
      composerValue: 'Edited content',
      messages: initialMessages,
      setMessages,
      reconcileConversationState,
    })))

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>)
    })

    const preserveMessages = applyMessageUpdaters(
      setMessages.mock.calls.map(([updater]) => updater),
      initialMessages,
    )

    expect(reconcileConversationState).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({
        clearErrorOnSuccess: false,
        preserveMessages,
      }),
    )
    expect(preserveMessages).toEqual([
      expect.objectContaining({
        id: 50,
      }),
      expect.objectContaining({
        id: 51,
        content: 'Edited content',
        status: 'completed',
      }),
      expect.objectContaining({
        role: 'assistant',
        status: 'failed',
        content: 'error.completeReply',
      }),
    ])
  })

  it('preserves the failed assistant when retry fails against a stale snapshot', async () => {
    const initialMessages = [
      createMessage(30, 'user', 'completed'),
      createMessage(31, 'assistant', 'failed'),
      createMessage(32, 'user', 'completed'),
      createMessage(33, 'assistant', 'completed'),
    ]
    const setMessages = vi.fn()
    const reconcileConversationState = vi.fn().mockResolvedValue(null)
    chatApiMock.retryMessage.mockRejectedValue(new Error('retry failed'))
    const { result } = renderHook(() => useChatGeneration(createOptions({
      messages: initialMessages,
      setMessages,
      reconcileConversationState,
    })))

    await act(async () => {
      await result.current.handleRetryAssistant(initialMessages[1])
    })

    const preserveMessages = applyMessageUpdaters(
      setMessages.mock.calls.map(([updater]) => updater),
      initialMessages,
    )

    expect(reconcileConversationState).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({
        clearErrorOnSuccess: false,
        preserveMessages,
      }),
    )
    expect(preserveMessages).toEqual([
      expect.objectContaining({
        id: 30,
      }),
      expect.objectContaining({
        id: 31,
        status: 'failed',
        content: 'error.completeReply',
      }),
    ])
  })

  it('preserves the failed assistant when regenerate fails against a stale snapshot', async () => {
    const initialMessages = [
      createMessage(40, 'user', 'completed'),
      createMessage(41, 'assistant', 'completed'),
      createMessage(42, 'user', 'completed'),
      createMessage(43, 'assistant', 'completed'),
    ]
    const setMessages = vi.fn()
    const reconcileConversationState = vi.fn().mockResolvedValue(null)
    chatApiMock.regenerateMessage.mockRejectedValue(new Error('regenerate failed'))
    const { result } = renderHook(() => useChatGeneration(createOptions({
      messages: initialMessages,
      setMessages,
      reconcileConversationState,
    })))

    await act(async () => {
      await result.current.handleRegenerateAssistant(initialMessages[1])
    })

    const preserveMessages = applyMessageUpdaters(
      setMessages.mock.calls.map(([updater]) => updater),
      initialMessages,
    )

    expect(reconcileConversationState).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({
        clearErrorOnSuccess: false,
        preserveMessages,
      }),
    )
    expect(preserveMessages).toEqual([
      expect.objectContaining({
        id: 40,
      }),
      expect.objectContaining({
        id: 41,
        status: 'failed',
        content: 'error.completeReply',
      }),
    ])
  })
})

type MessageStreamEvent = {
  type:
    | 'message_start'
    | 'reasoning_start'
    | 'reasoning_delta'
    | 'reasoning_done'
    | 'delta'
    | 'message_delta'
    | 'done'
    | 'cancelled'
    | 'error'
  content?: string
  message?: Message
  error?: string
  seq?: number
}
