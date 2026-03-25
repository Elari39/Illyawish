export type MessageRole = 'system' | 'user' | 'assistant'

export type MessageStatus = 'completed' | 'streaming' | 'failed' | 'cancelled'

export interface Attachment {
  id: string
  name: string
  mimeType: string
  url: string
  size: number
}

export interface ConversationSettings {
  systemPrompt: string
  model: string
  temperature: number | null
  maxTokens: number | null
}

export interface User {
  id: number
  username: string
}

export interface Conversation {
  id: number
  title: string
  isPinned: boolean
  isArchived: boolean
  settings: ConversationSettings
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: number
  conversationId: number
  role: MessageRole
  content: string
  attachments: Attachment[]
  status: MessageStatus
  createdAt: string
}

export interface LoginPayload {
  username: string
  password: string
}

export interface SendMessagePayload {
  content: string
  attachments?: Attachment[]
  options?: ConversationSettings
}

export interface UpdateConversationPayload {
  title?: string
  isPinned?: boolean
  isArchived?: boolean
  settings?: ConversationSettings
}

export interface StreamEvent {
  type: 'message_start' | 'delta' | 'done' | 'error' | 'cancelled'
  content?: string
  error?: string
  message?: Message
}
