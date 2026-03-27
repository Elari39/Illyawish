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
  contextWindowTurns: number | null
}

export interface ChatSettings {
  globalPrompt: string
  model: string
  temperature: number | null
  maxTokens: number | null
  contextWindowTurns: number | null
}

export interface ProviderPreset {
  id: number
  name: string
  baseURL: string
  hasApiKey: boolean
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
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  lastLoginAt: string | null
}

export interface Conversation {
  id: number
  title: string
  isPinned: boolean
  isArchived: boolean
  folder: string
  tags: string[]
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

export interface MessagePagination {
  hasMore: boolean
  nextBeforeId: number | null
}

export interface ConversationMessagesResponse {
  conversation: Conversation
  messages: Message[]
  pagination?: MessagePagination
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
  folder?: string
  tags?: string[]
  settings?: ConversationSettings
}

export interface ImportConversationMessagePayload {
  role: 'user' | 'assistant'
  content: string
}

export interface ImportConversationPayload {
  title: string
  settings?: {
    model?: string
  }
  messages: ImportConversationMessagePayload[]
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

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface AdminUser {
  id: number
  username: string
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  lastLoginAt: string | null
  maxConversations: number | null
  maxAttachmentsPerMessage: number | null
  dailyMessageLimit: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateUserPayload {
  username: string
  password: string
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  maxConversations: number | null
  maxAttachmentsPerMessage: number | null
  dailyMessageLimit: number | null
}

export interface UpdateUserPayload {
  role: 'admin' | 'member'
  status: 'active' | 'disabled'
  maxConversations: number | null
  maxAttachmentsPerMessage: number | null
  dailyMessageLimit: number | null
}

export interface ResetUserPasswordPayload {
  newPassword: string
}

export interface AuditLog {
  id: number
  actorUsername: string
  action: string
  targetType: string
  targetId: string
  targetName: string
  summary: string
  createdAt: string
}

export interface AuditLogListParams {
  actor?: string
  action?: string
  targetType?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

export interface ActiveProviderDistribution {
  name: string
  baseURL: string
  userCount: number
}

export interface AdminUsageStats {
  totalUsers: number
  activeUsers: number
  recentUsers: number
  totalConversations: number
  totalMessages: number
  totalAttachments: number
  configuredProviderPresets: number
  activeProviderPresets: number
  activeProviderDistribution: ActiveProviderDistribution[]
}

export interface WorkspacePolicy {
  defaultUserRole: 'admin' | 'member'
  defaultUserMaxConversations: number | null
  defaultUserMaxAttachmentsPerMessage: number | null
  defaultUserDailyMessageLimit: number | null
}
