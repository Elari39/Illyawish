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
  const { isLoading, user } = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="username">{user?.username ?? 'anonymous'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    meMock.mockReset()
    loginMock.mockReset()
    logoutMock.mockReset()
  })

  it('loads the current user on mount', async () => {
    meMock.mockResolvedValue({ id: 1, username: 'elaina' })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('elaina')
    expect(meMock).toHaveBeenCalledTimes(1)
  })

  it('clears the user when an unauthorized event is dispatched', async () => {
    meMock.mockResolvedValue({ id: 1, username: 'elaina' })

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
  })

  it('treats backend outages as a signed-out state', async () => {
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
  })
})
