import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_UNAUTHORIZED_EVENT, authApi, chatApi } from './api'
import { ApiError } from './http'

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
        id: 12,
        title: 'Legacy chat',
        isPinned: false,
        isArchived: false,
        folder: '',
        tags: [],
        settings: {
          systemPrompt: '',
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

    const response = await chatApi.getConversationMessages(20)

    expect(response.conversation).toEqual({
      id: 20,
      title: 'Legacy history',
      isPinned: false,
      isArchived: false,
      folder: '',
      tags: [],
      settings: {
        systemPrompt: '',
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
