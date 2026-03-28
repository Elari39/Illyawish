import type {
  AdminUsageStats,
  AdminUser,
  AuditLog,
  AuditLogListParams,
  CreateUserPayload,
  ResetUserPasswordPayload,
  UpdateUserPayload,
  WorkspacePolicy,
} from '../types/chat'
import { apiRequest } from './api-client'

function buildAuditLogQuery(params?: AuditLogListParams) {
  const search = new URLSearchParams()
  if (params?.actor) {
    search.set('actor', params.actor)
  }
  if (params?.action) {
    search.set('action', params.action)
  }
  if (params?.targetType) {
    search.set('targetType', params.targetType)
  }
  if (params?.dateFrom) {
    search.set('dateFrom', params.dateFrom)
  }
  if (params?.dateTo) {
    search.set('dateTo', params.dateTo)
  }
  if (typeof params?.limit === 'number') {
    search.set('limit', String(params.limit))
  }
  if (typeof params?.offset === 'number') {
    search.set('offset', String(params.offset))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const adminApi = {
  async listUsers() {
    const response = await apiRequest<{ users: AdminUser[] }>('/api/admin/users')
    return response.users
  },
  async createUser(payload: CreateUserPayload) {
    const response = await apiRequest<{ user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.user
  },
  async updateUser(userId: number, payload: UpdateUserPayload) {
    const response = await apiRequest<{ user: AdminUser }>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return response.user
  },
  async resetUserPassword(userId: number, payload: ResetUserPasswordPayload) {
    const response = await apiRequest<{ user: AdminUser }>(
      `/api/admin/users/${userId}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    return response.user
  },
  async listAuditLogs(params?: AuditLogListParams) {
    return apiRequest<{ logs: AuditLog[]; total: number }>(
      `/api/admin/audit-logs${buildAuditLogQuery(params)}`,
    )
  },
  getUsageStats() {
    return apiRequest<AdminUsageStats>('/api/admin/usage-stats')
  },
  getWorkspacePolicy() {
    return apiRequest<WorkspacePolicy>('/api/admin/workspace-policy')
  },
  updateWorkspacePolicy(payload: WorkspacePolicy) {
    return apiRequest<WorkspacePolicy>('/api/admin/workspace-policy', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
}
