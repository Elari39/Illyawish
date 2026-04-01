import { renderHook, waitFor } from '@testing-library/react'
import { useCallback, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chatApi } from '../../../lib/api'
import type {
  Conversation,
  ConversationMessagesResponse,
  Message,
} from '../../../types/chat'
import { useChatHistory } from './use-chat-history'

const conversation: Conversation = {
  id: 'conversation-1',
  title: 'Paged history',
  isPinned: false,
  isArchived: false,
  folder: '',
  tags: [],
  settings: {
    systemPrompt: '',
    providerPresetId: null,
    model: 'gpt-4.1-mini',
    temperature: 1,
    maxTokens: null,
    contextWindowTurns: null,
  },
  createdAt: '2026-03-26T00:00:00Z',
  updatedAt: '2026-03-26T00:00:00Z',
}

const messages: Message[] = [
  {
    id: 1,
    conversationId: 'conversation-1',
    role: 'user',
    content: 'Latest question',
    reasoningContent: '',
    attachments: [],
    status: 'completed',
    createdAt: '2026-03-26T00:00:00Z',
  },
]

function createResponse(
  overrides: Partial<ConversationMessagesResponse> = {},
): ConversationMessagesResponse {
  return {
    conversation,
    messages,
    pagination: {
      hasMore: true,
      nextBeforeId: 1,
    },
    ...overrides,
  }
}

function createStableCallback<T extends (...args: never[]) => unknown>() {
  return vi.fn<T>()
}

describe('useChatHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not resync the active conversation when unrelated callbacks change identity', async () => {
    const getConversationMessagesMock = vi
      .spyOn(chatApi, 'getConversationMessages')
      .mockResolvedValue(createResponse())

    const { result, rerender } = renderHook(({ resetVersion }: { resetVersion: number }) => {
      const resetForNewChatSettings = useCallback(() => {
        void resetVersion
      }, [resetVersion])

      const setChatError = useRef(createStableCallback<(value: string | null) => void>()).current
      const syncConversationIntoList = useRef(
        createStableCallback<(conversation: Conversation) => void>(),
      ).current
      const navigateHome = useRef(createStableCallback<(replace?: boolean) => void>()).current
      const setSkipAutoResume = useRef(createStableCallback<(value: boolean) => void>()).current
      const clearEditingMessage = useRef(createStableCallback<() => void>()).current
      const setConversationFolderDraft = useRef(
        createStableCallback<(value: string) => void>(),
      ).current
      const setConversationTagsDraft = useRef(
        createStableCallback<(value: string) => void>(),
      ).current
      const setPendingConversation = useRef(
        createStableCallback<(conversation: Conversation | null) => void>(),
      ).current
      const setSettingsDraft = useRef(
        createStableCallback<(value: Conversation['settings']) => void>(),
      ).current
      const setMessages = useRef(
        createStableCallback<(value: Message[] | ((previous: Message[]) => Message[])) => void>(),
      ).current
      const setIsLoadingMessages = useRef(
        createStableCallback<(value: boolean) => void>(),
      ).current
      const setIsSending = useRef(createStableCallback<(value: boolean) => void>()).current

      return useChatHistory({
        activeConversationId: 'conversation-1',
        search: '',
        showArchived: false,
        setChatError,
        syncConversationIntoList,
        navigateHome,
        setSkipAutoResume,
        t: ((key: string) => key) as Parameters<typeof useChatHistory>[0]['t'],
        activeConversationIdRef: useRef(null),
        activeGenerationRef: useRef(null),
        skipNextConversationSyncRef: useRef(null),
        messageViewportRef: useRef(null),
        clearEditingMessage,
        resetForNewChatSettings,
        setConversationFolderDraft,
        setConversationTagsDraft,
        setPendingConversation,
        setSettingsDraft,
        setMessages,
        setIsLoadingMessages,
        setIsSending,
      })
    }, {
      initialProps: {
        resetVersion: 1,
      },
    })

    await waitFor(() => {
      expect(result.current.hasMoreMessages).toBe(true)
    })

    expect(result.current.nextBeforeMessageId).toBe(1)
    const initialCallCount = getConversationMessagesMock.mock.calls.length

    rerender({ resetVersion: 2 })

    await waitFor(() => {
      expect(result.current.nextBeforeMessageId).toBe(1)
    })

    expect(getConversationMessagesMock.mock.calls.length).toBe(initialCallCount)
  })
})
