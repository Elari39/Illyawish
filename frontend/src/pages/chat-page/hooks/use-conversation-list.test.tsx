import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { I18nProvider } from '../../../i18n/provider'
import { LAST_CONVERSATION_STORAGE_KEY } from '../types'
import { useConversationList } from './use-conversation-list'

const listConversationsPageMock = vi.fn()

vi.mock('../../../lib/api', () => ({
  chatApi: {
    listConversationsPage: (...args: unknown[]) => listConversationsPageMock(...args),
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
)

function createConversation(id: number | string, overrides: Record<string, unknown> = {}) {
  return {
    id: String(id),
    title: `Conversation ${id}`,
    isPinned: false,
    isArchived: false,
    folder: '',
    tags: [] as string[],
    settings: {
      systemPrompt: 'You are a helpful assistant.',
      model: '',
      temperature: 1,
      maxTokens: null,
      contextWindowTurns: null,
    },
    createdAt: '2026-03-26T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
    ...overrides,
  }
}

describe('useConversationList', () => {
  beforeEach(() => {
    listConversationsPageMock.mockReset()
    window.localStorage.clear()
  })

  it('loads the first page and appends additional results', async () => {
    listConversationsPageMock.mockImplementation(async (params?: {
      offset?: number
    }) => (
      params?.offset === 1
        ? {
            conversations: [
              createConversation(2, {
                title: 'Beta',
              }),
            ],
            total: 2,
          }
        : {
            conversations: [
              createConversation(1, {
                title: 'Alpha',
                updatedAt: '2026-03-26T00:00:00Z',
              }),
            ],
            total: 2,
          }
    ))

    const navigateToConversation = vi.fn()
    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
    })
    expect(result.current.hasMoreConversations).toBe(true)

    await act(async () => {
      await result.current.loadConversations({ append: true })
    })

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['2', '1'])
    expect(result.current.hasMoreConversations).toBe(false)
    expect(listConversationsPageMock).toHaveBeenCalledWith({
      search: undefined,
      archived: false,
      limit: 20,
      offset: 0,
    })
    expect(listConversationsPageMock).toHaveBeenCalledWith({
      search: undefined,
      archived: false,
      limit: 20,
      offset: 1,
    })
  })

  it('re-queries when the search and archive filters change', async () => {
    listConversationsPageMock.mockResolvedValue({ conversations: [], total: 0 })

    const onError = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(listConversationsPageMock).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.setConversationSearch('beta')
    })

    await waitFor(() => {
      expect(listConversationsPageMock).toHaveBeenCalledWith({
        search: 'beta',
        archived: false,
        limit: 20,
        offset: 0,
      })
    })

    act(() => {
      result.current.setShowArchived(true)
    })

    await waitFor(() => {
      expect(listConversationsPageMock).toHaveBeenCalledWith({
        search: 'beta',
        archived: true,
        limit: 20,
        offset: 0,
      })
    })
  })

  it('filters the loaded conversations by folder and tags without refetching', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(1, {
          title: 'Roadmap',
          folder: 'Work',
          tags: ['urgent', 'planning'],
          updatedAt: '2026-03-28T00:00:00Z',
        }),
        createConversation(2, {
          title: 'Journal',
          folder: 'Personal',
          tags: ['reflection'],
          updatedAt: '2026-03-27T00:00:00Z',
        }),
        createConversation(3, {
          title: 'Inbox',
          folder: '',
          tags: ['planning'],
          updatedAt: '2026-03-26T00:00:00Z',
        }),
      ],
      total: 3,
    })

    const onError = vi.fn()
    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1', '2', '3'])
    })

    expect(result.current.availableFolders).toEqual(['Personal', 'Work'])

    act(() => {
      result.current.setSelectedFolder('Work')
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    expect(listConversationsPageMock).toHaveBeenCalledTimes(1)
    expect(result.current.availableTags).toEqual(['planning', 'urgent'])

    act(() => {
      result.current.toggleSelectedTag('urgent')
      result.current.toggleSelectedTag('planning')
    })

    expect(result.current.selectedTags).toEqual(['urgent', 'planning'])
    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
  })

  it('tracks selection mode and selected conversations locally', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(1),
        createConversation(2),
      ],
      total: 2,
    })

    const onError = vi.fn()
    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    act(() => {
      result.current.setSelectionMode(true)
      result.current.toggleConversationSelection('1')
      result.current.toggleConversationSelection('2')
    })

    expect(result.current.selectionMode).toBe(true)
    expect(result.current.selectedConversationIds).toEqual(['1', '2'])

    act(() => {
      result.current.setSelectionMode(false)
    })

    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedConversationIds).toEqual([])
  })

  it('keeps a visible conversation during search when local metadata no longer matches', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(7, {
          title: 'Alpha project',
          folder: 'alpha',
        }),
      ],
      total: 1,
    })
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
    })

    act(() => {
      result.current.setConversationSearch('alpha')
    })

    await waitFor(() => {
      expect(listConversationsPageMock).toHaveBeenCalledWith({
        search: 'alpha',
        archived: false,
        limit: 20,
        offset: 0,
      })
    })

    act(() => {
      result.current.syncConversationIntoList(createConversation(7, {
        title: 'Beta project',
        folder: 'beta',
      }))
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['7'])
    expect(result.current.hasMoreConversations).toBe(false)
  })

  it('does not insert a newly matching conversation from partial local metadata during search', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(1, {
          title: 'Alpha one',
          folder: 'alpha',
        }),
      ],
      total: 2,
    })
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
    })

    act(() => {
      result.current.setConversationSearch('alpha')
    })

    await waitFor(() => {
      expect(listConversationsPageMock).toHaveBeenCalledWith({
        search: 'alpha',
        archived: false,
        limit: 20,
        offset: 0,
      })
    })

    act(() => {
      result.current.syncConversationIntoList(createConversation(2, {
        title: 'Alpha two',
        folder: 'alpha',
        updatedAt: '2026-03-28T00:00:00Z',
      }))
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    expect(result.current.hasMoreConversations).toBe(true)
  })

  it('does not restore the last conversation when loading /chat', async () => {
    window.localStorage.setItem(LAST_CONVERSATION_STORAGE_KEY, '7')
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(7, {
          title: 'Resume me',
        }),
      ],
      total: 1,
    })

    const navigateToConversation = vi.fn()
    const onError = vi.fn()

    const { result, rerender } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
    })

    rerender()

    expect(navigateToConversation).not.toHaveBeenCalled()
  })

  it('keeps load more available when a local conversation is inserted after the first page', async () => {
    listConversationsPageMock.mockImplementation(async (params?: {
      offset?: number
    }) => (
      params?.offset === 1
        ? {
            conversations: [
              createConversation(2, {
                title: 'Second page',
                updatedAt: '2026-03-26T00:00:00Z',
              }),
            ],
            total: 2,
          }
        : {
            conversations: [
              createConversation(1, {
                title: 'First page',
                createdAt: '2026-03-26T00:00:00Z',
                updatedAt: '2026-03-25T00:00:00Z',
              }),
            ],
            total: 2,
          }
    ))
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: '99',
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    })

    act(() => {
      result.current.syncConversationIntoList({
        id: '99',
        title: 'Local active chat',
        isPinned: false,
        isArchived: false,
        folder: '',
        tags: [],
        settings: {
          systemPrompt: 'You are a helpful assistant.',
          model: '',
          temperature: 1,
          maxTokens: null,
  contextWindowTurns: null,
        },
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-27T00:00:00Z',
      })
    })

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['99', '1'])
    })
    expect(result.current.hasMoreConversations).toBe(true)

    await act(async () => {
      await result.current.loadConversations({ append: true })
    })

    expect(listConversationsPageMock).toHaveBeenLastCalledWith({
      search: undefined,
      archived: false,
      limit: 20,
      offset: 1,
    })
    expect(result.current.hasMoreConversations).toBe(false)
  })

  it('ignores an older fetch after syncing a local active conversation', async () => {
    let resolveListRequest: ((value: {
      conversations: Array<{
        id: string
        title: string
        isPinned: boolean
        isArchived: boolean
        folder: string
        tags: string[]
        settings: {
          systemPrompt: string
          model: string
          temperature: number
          maxTokens: null
          contextWindowTurns: null
        }
        createdAt: string
        updatedAt: string
      }>
      total: number
    }) => void) | null = null

    listConversationsPageMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListRequest = resolve
        }),
    )

    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: '99',
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    act(() => {
      result.current.syncConversationIntoList({
        id: '99',
        title: 'Fresh chat',
        isPinned: false,
        isArchived: false,
        folder: '',
        tags: [],
        settings: {
          systemPrompt: 'You are a helpful assistant.',
          model: '',
          temperature: 1,
          maxTokens: null,
  contextWindowTurns: null,
        },
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-27T00:00:00Z',
      })
    })

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['99'])
    })

    await act(async () => {
      resolveListRequest?.({
        conversations: [
          createConversation(1, {
            title: 'Older chat',
            updatedAt: '2026-03-26T00:00:00Z',
          }),
        ],
        total: 1,
      })
    })

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['99'])
    })
  })

  it('keeps a locally updated non-active conversation when an older fetch resolves later', async () => {
    let resolveListRequest: ((value: {
      conversations: Array<ReturnType<typeof createConversation>>
      total: number
    }) => void) | null = null

    listConversationsPageMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListRequest = resolve
        }),
    )

    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: '1',
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    act(() => {
      result.current.syncConversationIntoList(createConversation(2, {
        title: 'Fresh title',
        updatedAt: '2026-03-28T00:00:00Z',
      }))
    })

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['2'])
    })

    await act(async () => {
      resolveListRequest?.({
        conversations: [
          createConversation(2, {
            title: 'Stale title',
            updatedAt: '2026-03-26T00:00:00Z',
          }),
          createConversation(1, {
            title: 'Active chat',
            updatedAt: '2026-03-25T00:00:00Z',
          }),
        ],
        total: 2,
      })
    })

    await waitFor(() => {
      expect(result.current.conversations.find((conversation) => conversation.id === '2')?.title).toBe('Fresh title')
    })
  })

  it('decrements loaded counters when a loaded conversation is removed from the current view', async () => {
    listConversationsPageMock.mockImplementation(async (params?: {
      offset?: number
    }) => (
      params?.offset === 0
        ? {
            conversations: [
              createConversation(1, {
                title: 'First page',
                updatedAt: '2026-03-26T00:00:00Z',
              }),
            ],
            total: 1,
          }
        : {
            conversations: [
              createConversation(2, {
                title: 'Second page',
                createdAt: '2026-03-27T00:00:00Z',
                updatedAt: '2026-03-27T00:00:00Z',
              }),
            ],
            total: 1,
          }
    ))
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    })

    act(() => {
      result.current.removeConversationFromList('1')
    })

    expect(result.current.conversations).toEqual([])
    expect(result.current.hasMoreConversations).toBe(false)

    await act(async () => {
      await result.current.loadConversations({ append: true })
    })

    expect(listConversationsPageMock).toHaveBeenLastCalledWith({
      search: undefined,
      archived: false,
      limit: 20,
      offset: 0,
    })
  })

  it('keeps pagination offset stable when inserting a newly created local conversation', async () => {
    listConversationsPageMock.mockImplementation(async (params?: {
      offset?: number
    }) => (
      params?.offset === 1
        ? {
            conversations: [
              createConversation(2, {
                title: 'Second page',
                updatedAt: '2026-03-26T00:00:00Z',
              }),
            ],
            total: 3,
          }
        : {
            conversations: [
              createConversation(1, {
                title: 'First page',
                createdAt: '2026-03-25T00:00:00Z',
                updatedAt: '2026-03-25T00:00:00Z',
              }),
            ],
            total: 2,
          }
    ))
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: '99',
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    })

    act(() => {
      result.current.insertCreatedConversation({
        id: '99',
        title: 'Brand new chat',
        isPinned: false,
        isArchived: false,
        folder: '',
        tags: [],
        settings: {
          systemPrompt: 'You are a helpful assistant.',
          model: '',
          temperature: 1,
          maxTokens: null,
  contextWindowTurns: null,
        },
        createdAt: '2026-03-27T00:00:00Z',
        updatedAt: '2026-03-27T00:00:00Z',
      })
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['99', '1'])
    expect(result.current.hasMoreConversations).toBe(true)

    await act(async () => {
      await result.current.loadConversations({ append: true })
    })

    expect(listConversationsPageMock).toHaveBeenLastCalledWith({
      search: undefined,
      archived: false,
      limit: 20,
      offset: 1,
    })
  })

  it('updates counters when a conversation is archived out of the current filter', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(1, {
          title: 'Visible chat',
          updatedAt: '2026-03-26T00:00:00Z',
        }),
      ],
      total: 1,
    })
    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    })

    act(() => {
      result.current.syncConversationIntoList({
        id: '1',
        title: 'Visible chat',
        isPinned: false,
        isArchived: true,
        folder: '',
        tags: [],
        settings: {
          systemPrompt: 'You are a helpful assistant.',
          model: '',
          temperature: 1,
          maxTokens: null,
  contextWindowTurns: null,
        },
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-27T00:00:00Z',
      })
    })

    expect(result.current.conversations).toEqual([])
    expect(result.current.hasMoreConversations).toBe(false)
  })

  it('does not increment counters for synced conversations hidden by folder filters', async () => {
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        createConversation(1, {
          title: 'Work chat',
          folder: 'Work',
          updatedAt: '2026-03-26T00:00:00Z',
        }),
      ],
      total: 1,
    })

    const onError = vi.fn()
    const navigateToConversation = vi.fn()

    const { result } = renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    })

    act(() => {
      result.current.setSelectedFolder('Work')
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    expect(result.current.conversationTotal).toBe(1)

    act(() => {
      result.current.syncConversationIntoList(createConversation(2, {
        title: 'Personal chat',
        folder: 'Personal',
        updatedAt: '2026-03-27T00:00:00Z',
      }))
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual(['1'])
    expect(result.current.conversationTotal).toBe(1)
    expect(result.current.hasMoreConversations).toBe(false)
  })

})
