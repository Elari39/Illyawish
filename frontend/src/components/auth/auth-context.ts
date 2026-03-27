import { createContext } from 'react'

import type { LoginPayload, User } from '../../types/chat'

export interface AuthContextValue {
  user: User | null
  isLoading: boolean
  authErrorCode?: 'backend_unreachable'
  login: (payload: LoginPayload) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
