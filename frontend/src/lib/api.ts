import { streamSSE } from './sse'
import {
  AUTH_UNAUTHORIZED_EVENT,
  fetchOrThrow,
  isNetworkError,
  isUnauthorizedError,
  notifyUnauthorized,
  shouldNotifyUnauthorized,
  toApiError,
} from './http'
import type {
  Attachment,
  AdminUser,
  AdminUsageStats,
  AuditLog,
  AuditLogListParams,
  BootstrapPayload,
  BootstrapStatus,
  ChangePasswordPayload,
  ChatSettings,
  CreateUserPayload,
  CreateProviderPayload,
  CreateConversationPayload,
  ConversationSettings,
  Conversation,
  ConversationMessagesResponse,
  ImportConversationPayload,
  LoginPayload,
  ProviderState,
  ResetUserPasswordPayload,
  SendMessagePayload,
  StreamEvent,
  TestProviderPayload,
  TestProviderResult,
  UpdateUserPayload,
  UpdateProviderPayload,
  UpdateConversationPayload,
  User,
  WorkspacePolicy,
} from '../types/chat'

const API_BASE_URL = ''
const defaultConversationSettings: ConversationSettings = {
  systemPrompt: '',
  model: '',
  temperature: null,
  maxTokens: null,
  contextWindowTurns: null,
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')

  const response = await fetchOrThrow(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const apiError = await toApiError(response)
    if (response.status === 401 && shouldNotifyUnauthorized(apiError.code)) {
      notifyUnauthorized(apiError.code)
    }
    throw apiError
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
export {
  AUTH_UNAUTHORIZED_EVENT,
  isNetworkError,
  isUnauthorizedError,
}

function normalizeConversationSettings(
  settings: Partial<ConversationSettings> | null | undefined,
): ConversationSettings {
  return {
    systemPrompt:
      typeof settings?.systemPrompt === 'string'
        ? settings.systemPrompt
        : defaultConversationSettings.systemPrompt,
    model:
      typeof settings?.model === 'string'
        ? settings.model
        : defaultConversationSettings.model,
    temperature:
      typeof settings?.temperature === 'number' || settings?.temperature === null
        ? settings.temperature
        : defaultConversationSettings.temperature,
    maxTokens:
      typeof settings?.maxTokens === 'number' || settings?.maxTokens === null
        ? settings.maxTokens
        : defaultConversationSettings.maxTokens,
    contextWindowTurns:
      typeof settings?.contextWindowTurns === 'number' || settings?.contextWindowTurns === null
        ? settings.contextWindowTurns
        : defaultConversationSettings.contextWindowTurns,
  }
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    folder: typeof conversation.folder === 'string' ? conversation.folder : '',
    tags: Array.isArray(conversation.tags)
      ? conversation.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    settings: normalizeConversationSettings(conversation.settings),
  }
}

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

export const chatApi = {
  getChatSettings() {
    return apiRequest<ChatSettings>('/api/chat/settings')
  },
  updateChatSettings(payload: ChatSettings) {
    return apiRequest<ChatSettings>('/api/chat/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  async listConversationsPage(params?: {
    search?: string
    archived?: boolean
    limit?: number
    offset?: number
  }) {
    const search = new URLSearchParams()
    if (params?.search) {
      search.set('search', params.search)
    }
    if (typeof params?.archived === 'boolean') {
      search.set('archived', String(params.archived))
    }
    if (typeof params?.limit === 'number') {
      search.set('limit', String(params.limit))
    }
    if (typeof params?.offset === 'number') {
      search.set('offset', String(params.offset))
    }

    const query = search.toString()
    const response = await apiRequest<{
      conversations: Conversation[]
      total: number
    }>(
      `/api/conversations${query ? `?${query}` : ''}`,
    )
    return {
      ...response,
      conversations: response.conversations.map(normalizeConversation),
    }
  },
  async listConversations() {
    const response = await this.listConversationsPage()
    return response.conversations
  },
  async createConversation(payload?: CreateConversationPayload) {
    const response = await apiRequest<{ conversation: Conversation }>(
      '/api/conversations',
      {
        method: 'POST',
        body: payload ? JSON.stringify(payload) : undefined,
      },
    )
    return normalizeConversation(response.conversation)
  },
  async importConversation(payload: ImportConversationPayload) {
    const response = await apiRequest<{ conversation: Conversation }>(
      '/api/conversations/import',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    return normalizeConversation(response.conversation)
  },
  async updateConversation(
    conversationId: number,
    payload: UpdateConversationPayload,
  ) {
    const response = await apiRequest<{ conversation: Conversation }>(
      `/api/conversations/${conversationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    )
    return normalizeConversation(response.conversation)
  },
  async getConversationMessages(
    conversationId: number,
    params?: {
      beforeId?: number
      limit?: number
    },
  ) {
    const search = new URLSearchParams()
    if (typeof params?.beforeId === 'number') {
      search.set('beforeId', String(params.beforeId))
    }
    if (typeof params?.limit === 'number') {
      search.set('limit', String(params.limit))
    }

    const query = search.toString()
    const response = await apiRequest<ConversationMessagesResponse>(
      `/api/conversations/${conversationId}/messages${query ? `?${query}` : ''}`,
    )
    return {
      ...response,
      conversation: normalizeConversation(response.conversation),
    }
  },
  async deleteConversation(conversationId: number) {
    await apiRequest<{ ok: boolean }>(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
    })
  },
  async cancelGeneration(conversationId: number) {
    await apiRequest<{ ok: boolean }>(`/api/conversations/${conversationId}/cancel`, {
      method: 'POST',
    })
  },
  async streamMessage(
    conversationId: number,
    payload: SendMessagePayload,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages`,
      payload,
      onEvent,
      'POST',
      signal,
    )
  },
  async retryMessage(
    conversationId: number,
    messageId: number,
    settings: ConversationSettings | null,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/${messageId}/retry`,
      settings ? { options: settings } : undefined,
      onEvent,
      'POST',
      signal,
    )
  },
  async regenerateMessage(
    conversationId: number,
    messageId: number,
    settings: ConversationSettings | null,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/${messageId}/regenerate`,
      settings ? { options: settings } : undefined,
      onEvent,
      'POST',
      signal,
    )
  },
  async editMessage(
    conversationId: number,
    messageId: number,
    payload: SendMessagePayload,
    onEvent: (event: StreamEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      payload,
      onEvent,
      'PATCH',
      signal,
    )
  },
}

export const providerApi = {
  list() {
    return apiRequest<ProviderState>('/api/ai/providers')
  },
  create(payload: CreateProviderPayload) {
    return apiRequest<ProviderState>('/api/ai/providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(providerId: number, payload: UpdateProviderPayload) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  activate(providerId: number) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}/activate`, {
      method: 'POST',
    })
  },
  delete(providerId: number) {
    return apiRequest<ProviderState>(`/api/ai/providers/${providerId}`, {
      method: 'DELETE',
    })
  },
  test(payload: TestProviderPayload) {
    return apiRequest<TestProviderResult>('/api/ai/providers/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
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
    const response = await apiRequest<{ user: AdminUser }>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return response.user
  },
  async listAuditLogs(params?: AuditLogListParams) {
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
    return apiRequest<{ logs: AuditLog[]; total: number }>(`/api/admin/audit-logs${query ? `?${query}` : ''}`)
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

export const attachmentApi = {
  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiRequest<{ attachment: Attachment }>('/api/attachments', {
      method: 'POST',
      body: formData,
    })
    return response.attachment
  },
}

async function streamChatRequest(
  path: string,
  payload: unknown,
  onEvent: (event: StreamEvent) => void | Promise<void>,
  method = 'POST',
  signal?: AbortSignal,
) {
  await streamSSE(
    `${API_BASE_URL}${path}`,
    {
      method,
      signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    },
    async (event) => {
      const parsed = JSON.parse(event.data) as StreamEvent
      parsed.type = event.event as StreamEvent['type']
      await onEvent(parsed)
    },
  )
}
