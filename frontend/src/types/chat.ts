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

export interface ProviderPreset {
  id: number
  name: string
  baseURL: string
  apiKeyHint: string
  models: string[]
  defaultModel: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderFallbackState {
  available: boolean
  baseURL: string
  models: string[]
  defaultModel: string
}

export interface ProviderState {
  presets: ProviderPreset[]
  activePresetId: number | null
  currentSource: 'preset' | 'fallback' | 'none'
  fallback: ProviderFallbackState
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

export interface BootstrapPayload {
  username: string
  password: string
}

export interface BootstrapStatus {
  required: boolean
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

export interface CreateProviderPayload {
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  defaultModel: string
}

export interface UpdateProviderPayload {
  name?: string
  baseURL?: string
  apiKey?: string
  models?: string[]
  defaultModel?: string
}

export interface TestProviderPayload {
  providerId?: number
  baseURL: string
  apiKey?: string
  defaultModel: string
}

export interface TestProviderResult {
  ok: boolean
  message: string
  resolvedBaseURL: string
  resolvedModel: string
}

export interface StreamEvent {
  type: 'message_start' | 'delta' | 'done' | 'error' | 'cancelled'
  content?: string
  error?: string
  message?: Message
}
