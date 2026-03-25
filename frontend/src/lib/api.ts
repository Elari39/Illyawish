import { streamSSE } from './sse'
import type {
  CreateProviderPayload,
  ConversationSettings,
  Conversation,
  LoginPayload,
  Message,
  ProviderState,
  SendMessagePayload,
  StreamEvent,
  UpdateProviderPayload,
  UpdateConversationPayload,
  User,
} from '../types/chat'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function toApiError(response: Response) {
  let message = `Request failed with status ${response.status}`
  const text = await response.text()
  try {
    const payload = JSON.parse(text) as { error?: string }
    if (payload.error) {
      message = payload.error
    }
  } catch {
    if (text.trim()) {
      message = text.trim()
    }
  }

  return new ApiError(message, response.status)
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

export const authApi = {
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
