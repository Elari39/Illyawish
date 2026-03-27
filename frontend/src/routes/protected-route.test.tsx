import { render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { TestProviders } from '../test/test-providers'
import { ProtectedRoute, PublicOnlyRoute } from './protected-route'

describe('ProtectedRoute', () => {
  const baseAuthValue: AuthContextValue = {
    user: {
      id: 1,
      username: 'member',
      role: 'member',
      status: 'active',
      lastLoginAt: null,
    },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    authErrorCode: undefined,
  }

  it('redirects members away from admin-only routes', async () => {
    render(
      <AuthContext.Provider value={baseAuthValue}>
        <TestProviders initialEntries={['/admin']}>
          <Routes>
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route path="/admin" element={<div>admin</div>} />
            </Route>
            <Route path="/chat" element={<div>chat</div>} />
          </Routes>
        </TestProviders>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('chat')).toBeInTheDocument()
  })

  it('shows a backend unavailable screen instead of redirecting when auth cannot refresh', async () => {
    render(
      <AuthContext.Provider
        value={{
          ...baseAuthValue,
          user: null,
          authErrorCode: 'backend_unreachable',
        }}
      >
        <TestProviders initialEntries={['/chat']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/chat" element={<div>chat</div>} />
            </Route>
            <Route path="/login" element={<div>login</div>} />
          </Routes>
        </TestProviders>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('Unable to reach the backend service. Make sure the Go server is running.')).toBeInTheDocument()
    expect(screen.queryByText('login')).not.toBeInTheDocument()
  })

  it('shows a backend unavailable screen on public-only routes instead of redirecting authenticated users', async () => {
    render(
      <AuthContext.Provider
        value={{
          ...baseAuthValue,
          user: null,
          authErrorCode: 'backend_unreachable',
        }}
      >
        <TestProviders initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={(
                <PublicOnlyRoute>
                  <div>login</div>
                </PublicOnlyRoute>
              )}
            />
            <Route path="/chat" element={<div>chat</div>} />
          </Routes>
        </TestProviders>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('Unable to reach the backend service. Make sure the Go server is running.')).toBeInTheDocument()
    expect(screen.queryByText('chat')).not.toBeInTheDocument()
  })
})
