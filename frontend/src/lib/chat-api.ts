import type {
  ChatSettings,
  Conversation,
  ConversationMessagesResponse,
  ConversationSettings,
  CreateConversationPayload,
  ImportConversationPayload,
  SendMessagePayload,
  StreamEvent,
  UpdateConversationPayload,
} from '../types/chat'
import { apiRequest, streamChatRequest } from './api-client'
import { normalizeConversation } from './api-normalizers'

function buildConversationListQuery(params?: {
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
  return query ? `?${query}` : ''
}

function buildConversationMessagesQuery(params?: {
  beforeId?: number
  limit?: number
}) {
  const search = new URLSearchParams()
  if (typeof params?.beforeId === 'number') {
    search.set('beforeId', String(params.beforeId))
  }
  if (typeof params?.limit === 'number') {
    search.set('limit', String(params.limit))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
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
    const response = await apiRequest<{
      conversations: Conversation[]
      total: number
    }>(`/api/conversations${buildConversationListQuery(params)}`)
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
    const response = await apiRequest<ConversationMessagesResponse>(
      `/api/conversations/${conversationId}/messages${buildConversationMessagesQuery(params)}`,
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
