import type {
  BootstrapPayload,
  BootstrapStatus,
  ChangePasswordPayload,
  LoginPayload,
  User,
} from '../types/chat'
import { apiRequest } from './api-client'

export const authApi = {
  bootstrapStatus() {
    return apiRequest<BootstrapStatus>('/api/auth/bootstrap/status')
  },
  bootstrap(payload: BootstrapPayload) {
    return apiRequest<User>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  login(payload: LoginPayload) {
    return apiRequest<User>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logout() {
    return apiRequest<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    })
  },
  changePassword(payload: ChangePasswordPayload) {
    return apiRequest<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logoutAll() {
    return apiRequest<{ ok: boolean }>('/api/auth/logout-all', {
      method: 'POST',
    })
  },
  me() {
    return apiRequest<User>('/api/auth/me')
  },
}
