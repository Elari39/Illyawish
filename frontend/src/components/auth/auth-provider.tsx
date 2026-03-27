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
  const [authErrorCode, setAuthErrorCode] = useState<'backend_unreachable' | undefined>(undefined)

  useEffect(() => {
    void refreshUser()
  }, [])

  useEffect(() => {
    function handleUnauthorized() {
      setUser(null)
      setAuthErrorCode(undefined)
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
      setAuthErrorCode(undefined)
    } catch (error) {
      if (isNetworkError(error)) {
        setAuthErrorCode('backend_unreachable')
      } else {
        setAuthErrorCode(undefined)
      }

      if (isUnauthorizedError(error)) {
        setUser(null)
      } else if (!isNetworkError(error)) {
        console.error(error)
        setUser(null)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function login(payload: LoginPayload) {
    const nextUser = await authApi.login(payload)
    setUser(nextUser)
    setAuthErrorCode(undefined)
    return nextUser
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setAuthErrorCode(undefined)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        authErrorCode,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
