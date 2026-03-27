import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { AuthProvider } from './auth-provider'
import { useAuth } from './use-auth'

const meMock = vi.fn()
const loginMock = vi.fn()
const logoutMock = vi.fn()

vi.mock('../../lib/api', () => ({
  AUTH_UNAUTHORIZED_EVENT: 'aichat:unauthorized',
  authApi: {
    me: () => meMock(),
    login: (...args: unknown[]) => loginMock(...args),
    logout: () => logoutMock(),
  },
  isNetworkError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    error.kind === 'network',
  isUnauthorizedError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    error.kind === 'unauthorized',
}))

function AuthProbe() {
  const { authErrorCode, isLoading, user } = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="username">{user?.username ?? 'anonymous'}</span>
      <span data-testid="auth-error">{authErrorCode ?? 'none'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  const currentUser = {
    id: 1,
    username: 'elaina',
    role: 'admin' as const,
    status: 'active' as const,
    lastLoginAt: null,
  }

  beforeEach(() => {
    meMock.mockReset()
    loginMock.mockReset()
    logoutMock.mockReset()
  })

  it('loads the current user on mount', async () => {
    meMock.mockResolvedValue(currentUser)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('elaina')
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none')
    expect(meMock).toHaveBeenCalledTimes(1)
  })

  it('clears the user when an unauthorized event is dispatched', async () => {
    meMock.mockResolvedValue(currentUser)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('elaina')
    })

    window.dispatchEvent(new CustomEvent('aichat:unauthorized'))

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('anonymous')
    })
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none')
  })

  it('exposes backend outages without treating them as signed-out state', async () => {
    meMock.mockRejectedValue({ kind: 'network' })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('anonymous')
    expect(screen.getByTestId('auth-error')).toHaveTextContent('backend_unreachable')
  })

  it('keeps the current user when a refresh hits a backend outage', async () => {
    meMock
      .mockResolvedValueOnce(currentUser)
      .mockRejectedValueOnce({ kind: 'network' })

    function RefreshProbe() {
      const { refreshUser } = useAuth()

      return (
        <button onClick={() => void refreshUser()} type="button">
          refresh
        </button>
      )
    }

    render(
      <AuthProvider>
        <AuthProbe />
        <RefreshProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('elaina')
    })

    screen.getByRole('button', { name: 'refresh' }).click()

    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toHaveTextContent('backend_unreachable')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('elaina')
  })
})
