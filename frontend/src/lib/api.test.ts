import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_UNAUTHORIZED_EVENT, authApi } from './api'
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
