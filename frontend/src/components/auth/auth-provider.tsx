import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import {
  AUTH_UNAUTHORIZED_EVENT,
  authApi,
  isNetworkError,
  isUnauthorizedError,
} from '../../lib/api'
import type { LoginPayload, User } from '../../types/chat'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void refreshUser()
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null)
      setIsLoading(false)
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [])

  async function refreshUser() {
    try {
      const nextUser = await authApi.me()
      setUser(nextUser)
    } catch (error) {
      if (!isUnauthorizedError(error) && !isNetworkError(error)) {
        console.error(error)
      }
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function login(payload: LoginPayload) {
    const nextUser = await authApi.login(payload)
    setUser(nextUser)
    return nextUser
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
