import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { I18nProvider } from '../../../i18n/provider'
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
              {
                id: 2,
                title: 'Beta',
                isPinned: false,
                isArchived: false,
                settings: {
                  systemPrompt: 'You are a helpful assistant.',
                  model: '',
                  temperature: 1,
                  maxTokens: null,
                },
                createdAt: '2026-03-26T00:00:00Z',
                updatedAt: '2026-03-27T00:00:00Z',
              },
            ],
            total: 2,
          }
        : {
            conversations: [
              {
                id: 1,
                title: 'Alpha',
                isPinned: false,
                isArchived: false,
                settings: {
                  systemPrompt: 'You are a helpful assistant.',
                  model: '',
                  temperature: 1,
                  maxTokens: null,
                },
                createdAt: '2026-03-26T00:00:00Z',
                updatedAt: '2026-03-26T00:00:00Z',
              },
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

    await act(async () => {
      await result.current.loadConversations({ append: true })
    })

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    expect(result.current.conversations.map((conversation) => conversation.id)).toEqual([2, 1])
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

  it('restores the last conversation when it is still available', async () => {
    window.localStorage.setItem('aichat:last-conversation-id', '7')
    listConversationsPageMock.mockResolvedValue({
      conversations: [
        {
          id: 7,
          title: 'Resume me',
          isPinned: false,
          isArchived: false,
          settings: {
            systemPrompt: 'You are a helpful assistant.',
            model: '',
            temperature: 1,
            maxTokens: null,
          },
          createdAt: '2026-03-26T00:00:00Z',
          updatedAt: '2026-03-27T00:00:00Z',
        },
      ],
      total: 1,
    })

    const navigateToConversation = vi.fn()
    const onError = vi.fn()

    renderHook(
      () =>
        useConversationList({
          activeConversationId: null,
          onError,
          navigateToConversation,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(navigateToConversation).toHaveBeenCalledWith(7, true)
    })
  })
})
