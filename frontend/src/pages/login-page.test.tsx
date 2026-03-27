import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../components/auth/auth-context'
import { I18nProvider } from '../i18n/provider'
import { authApi, chatApi } from '../lib/api'
import { LoginPage } from './login-page'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location">{location.pathname}</div>
}

describe('LoginPage', () => {
  const authValue: AuthContextValue = {
    user: null,
    isLoading: false,
    login: vi.fn().mockResolvedValue({
      id: 1,
      username: 'Elaina',
      role: 'admin',
      status: 'active',
      lastLoginAt: null,
    }),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('navigates into the workspace even if conversation listing would fail', async () => {
    vi.spyOn(authApi, 'bootstrapStatus').mockResolvedValue({ required: false })
    const listConversationsSpy = vi
      .spyOn(chatApi, 'listConversations')
      .mockRejectedValue(new Error('should not be called'))

    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/login']}>
          <I18nProvider>
            <Routes>
              <Route path="/login" element={<><LoginPage /><LocationProbe /></>} />
              <Route path="/chat" element={<LocationProbe />} />
            </Routes>
          </I18nProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    await waitFor(() => {
      expect(authApi.bootstrapStatus).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'elaina' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enter workspace' }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/chat')
    })

    expect(authValue.login).toHaveBeenCalledWith({
      username: 'elaina',
      password: 'secret',
    })
    expect(listConversationsSpy).not.toHaveBeenCalled()
  })
})
