import { streamSSE } from './sse'
import {
  AUTH_UNAUTHORIZED_EVENT,
  fetchOrThrow,
  isNetworkError,
  isUnauthorizedError,
  notifyUnauthorized,
  toApiError,
} from './http'
import type {
  Attachment,
  BootstrapPayload,
  BootstrapStatus,
  CreateProviderPayload,
  ConversationSettings,
  Conversation,
  ImportConversationPayload,
  LoginPayload,
  Message,
  ProviderState,
  SendMessagePayload,
  StreamEvent,
  TestProviderPayload,
  TestProviderResult,
  UpdateProviderPayload,
  UpdateConversationPayload,
  User,
} from '../types/chat'

const API_BASE_URL = ''

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
    if (response.status === 401) {
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
  me() {
    return apiRequest<User>('/api/auth/me')
  },
}

export const chatApi = {
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
    return response
  },
  async listConversations() {
    const response = await this.listConversationsPage()
    return response.conversations
  },
  async createConversation() {
    const response = await apiRequest<{ conversation: Conversation }>(
      '/api/conversations',
      {
        method: 'POST',
      },
    )
    return response.conversation
  },
  async importConversation(payload: ImportConversationPayload) {
    const response = await apiRequest<{ conversation: Conversation }>(
      '/api/conversations/import',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    return response.conversation
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
    return response.conversation
  },
  async getConversationMessages(conversationId: number) {
    const response = await apiRequest<{
      conversation: Conversation
      messages: Message[]
    }>(`/api/conversations/${conversationId}/messages`)
    return response
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
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages`,
      payload,
      onEvent,
    )
  },
  async retryMessage(
    conversationId: number,
    messageId: number,
    settings: ConversationSettings | null,
    onEvent: (event: StreamEvent) => void | Promise<void>,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/${messageId}/retry`,
      settings ? { options: settings } : undefined,
      onEvent,
    )
  },
  async regenerateMessage(
    conversationId: number,
    settings: ConversationSettings | null,
    onEvent: (event: StreamEvent) => void | Promise<void>,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/regenerate`,
      settings ? { options: settings } : undefined,
      onEvent,
    )
  },
  async editMessage(
    conversationId: number,
    messageId: number,
    payload: SendMessagePayload,
    onEvent: (event: StreamEvent) => void | Promise<void>,
  ) {
    await streamChatRequest(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      payload,
      onEvent,
      'PATCH',
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
) {
  await streamSSE(
    `${API_BASE_URL}${path}`,
    {
      method,
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
