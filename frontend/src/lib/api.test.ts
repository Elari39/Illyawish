import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_UNAUTHORIZED_EVENT, authApi, chatApi } from './api'
import { ApiError } from './http'
import * as sseModule from './sse'

describe('authApi unauthorized handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not broadcast unauthorized events for non-session 401 errors', async () => {
    const unauthorizedSpy = vi.fn()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorizedSpy)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'current password is incorrect',
            code: 'validation_failed',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(
      authApi.changePassword({
        currentPassword: 'wrong-password',
        newPassword: 'brand-new-secret',
      }),
    ).rejects.toEqual(new ApiError('current password is incorrect', 401, 'validation_failed'))

    expect(unauthorizedSpy).not.toHaveBeenCalled()
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, unauthorizedSpy)
  })
})

describe('chatApi response normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes malformed conversation rows from the conversation list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            conversations: [
              {
                id: 12,
                title: 'Legacy chat',
                isPinned: false,
                isArchived: false,
                folder: null,
                tags: null,
                settings: null,
                createdAt: '2026-03-26T09:08:00Z',
                updatedAt: '2026-03-26T09:08:00Z',
              },
            ],
            total: 1,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    const response = await chatApi.listConversationsPage({
      archived: false,
    })

    expect(response.total).toBe(1)
    expect(response.conversations).toEqual([
      {
        id: '12',
        title: 'Legacy chat',
        isPinned: false,
        isArchived: false,
        folder: '',
        tags: [],
        knowledgeSpaceIds: [],
        settings: {
          systemPrompt: '',
          providerPresetId: null,
          model: '',
          temperature: null,
          maxTokens: null,
          contextWindowTurns: null,
        },
        createdAt: '2026-03-26T09:08:00Z',
        updatedAt: '2026-03-26T09:08:00Z',
      },
    ])
  })

  it('normalizes malformed conversation data in the message response payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            conversation: {
              id: 20,
              title: 'Legacy history',
              isPinned: false,
              isArchived: false,
              folder: null,
              tags: null,
              settings: {
                model: 'gpt-4.1-mini',
              },
              createdAt: '2026-03-26T09:08:00Z',
              updatedAt: '2026-03-26T09:08:00Z',
            },
            messages: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    const response = await chatApi.getConversationMessages('20')

    expect(response.conversation).toEqual({
      id: '20',
      title: 'Legacy history',
      isPinned: false,
      isArchived: false,
      folder: '',
      tags: [],
      knowledgeSpaceIds: [],
      settings: {
        systemPrompt: '',
        providerPresetId: null,
        model: 'gpt-4.1-mini',
        temperature: null,
        maxTokens: null,
        contextWindowTurns: null,
      },
      createdAt: '2026-03-26T09:08:00Z',
      updatedAt: '2026-03-26T09:08:00Z',
    })
  })
})

describe('chatApi request serialization', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('serializes conversation list query parameters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          conversations: [],
          total: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await chatApi.listConversationsPage({
      search: 'release',
      archived: true,
      limit: 20,
      offset: 40,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/conversations?search=release&archived=true&limit=20&offset=40',
      expect.any(Object),
    )
  })

  it('serializes audit log query parameters', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          logs: [],
          total: 0,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { adminApi } = await import('./api')
    await adminApi.listAuditLogs({
      actor: 'aria',
      action: 'admin.user_updated',
      targetType: 'user',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      limit: 50,
      offset: 100,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/audit-logs?actor=aria&action=admin.user_updated&targetType=user&dateFrom=2026-03-01&dateTo=2026-03-31&limit=50&offset=100',
      expect.any(Object),
    )
  })
})

describe('chatApi streaming request wrappers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('passes streamMessage through the SSE client with the expected request shape', async () => {
    const streamSpy = vi.spyOn(sseModule, 'streamSSE').mockResolvedValue(undefined)

    await chatApi.streamMessage(
      '12',
      {
        content: 'hello',
        attachments: [],
      },
      async () => {},
    )

    expect(streamSpy).toHaveBeenCalledWith(
      '/api/conversations/12/messages',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          content: 'hello',
          attachments: [],
        }),
      }),
      expect.any(Function),
    )
  })

  it('passes retry, regenerate, and edit requests through the SSE client with stable paths and methods', async () => {
    const streamSpy = vi.spyOn(sseModule, 'streamSSE').mockResolvedValue(undefined)

    await chatApi.retryMessage('9', 101, {
      systemPrompt: '',
      model: 'gpt-4.1-mini',
      temperature: null,
      maxTokens: null,
      contextWindowTurns: null,
    }, async () => {})
    await chatApi.regenerateMessage('9', 102, null, async () => {})
    await chatApi.editMessage(
      '9',
      103,
      {
        content: 'updated',
        attachments: [],
      },
      async () => {},
    )

    expect(streamSpy).toHaveBeenNthCalledWith(
      1,
      '/api/conversations/9/messages/101/retry',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          options: {
            systemPrompt: '',
            model: 'gpt-4.1-mini',
            temperature: null,
            maxTokens: null,
            contextWindowTurns: null,
          },
        }),
      }),
      expect.any(Function),
    )
    expect(streamSpy).toHaveBeenNthCalledWith(
      2,
      '/api/conversations/9/messages/102/regenerate',
      expect.objectContaining({
        method: 'POST',
        body: undefined,
      }),
      expect.any(Function),
    )
    expect(streamSpy).toHaveBeenNthCalledWith(
      3,
      '/api/conversations/9/messages/103',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          content: 'updated',
          attachments: [],
        }),
      }),
      expect.any(Function),
    )
  })
})
