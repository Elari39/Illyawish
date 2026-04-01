export type MessageRole = 'system' | 'user' | 'assistant'

export type MessageStatus = 'completed' | 'streaming' | 'failed' | 'cancelled'

export type ProviderFormat = 'openai' | 'anthropic' | 'gemini'

export interface Attachment {
  id: string
  name: string
  mimeType: string
  url: string
  size: number
}

export interface ConversationSettings {
  systemPrompt: string
  providerPresetId?: number | null
  model: string
  temperature: number | null
  maxTokens: number | null
  contextWindowTurns: number | null
}

export interface ChatSettings {
  globalPrompt: string
  providerPresetId?: number | null
  model: string
  temperature: number | null
  maxTokens: number | null
  contextWindowTurns: number | null
}

export interface ProviderPreset {
  id: number
  name: string
  format?: ProviderFormat
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
  format?: ProviderFormat
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
  id: string
  title: string
  isPinned: boolean
  isArchived: boolean
  folder: string
  tags: string[]
  workflowPresetId?: number | null
  knowledgeSpaceIds?: number[]
  settings: ConversationSettings
  createdAt: string
  updatedAt: string
}

export interface AgentCitation {
  documentId: number
  documentName: string
  chunkId: number
  snippet: string
  sourceUri: string
}

export interface AgentToolCallSummary {
  toolName: string
  status: string
  inputSummary: string
  outputSummary: string
}

export interface AgentRunSummary {
  workflowTemplateKey: string
  workflowPresetId: number | null
  knowledgeSpaceIds: number[]
  toolCalls: AgentToolCallSummary[]
  citations: AgentCitation[]
}

export interface Message {
  id: number
  conversationId: string
  role: MessageRole
  content: string
  reasoningContent?: string
  attachments: Attachment[]
  status: MessageStatus
  runSummary?: AgentRunSummary
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
  workflowPresetId?: number | null
  workflowInputs?: Record<string, unknown>
  knowledgeSpaceIds?: number[]
}

export interface UpdateConversationPayload {
  title?: string
  isPinned?: boolean
  isArchived?: boolean
  folder?: string
  tags?: string[]
  workflowPresetId?: number | null
  knowledgeSpaceIds?: number[]
  settings?: ConversationSettings
}

export interface CreateConversationPayload {
  folder?: string
  tags?: string[]
  workflowPresetId?: number | null
  knowledgeSpaceIds?: number[]
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
  format: ProviderFormat
  name: string
  baseURL: string
  apiKey?: string
  reuseActiveApiKey?: boolean
  models: string[]
  defaultModel: string
}

export interface UpdateProviderPayload {
  format?: ProviderFormat
  name?: string
  baseURL?: string
  apiKey?: string
  models?: string[]
  defaultModel?: string
}

export interface TestProviderPayload {
  providerId?: number
  format?: ProviderFormat
  baseURL: string
  apiKey?: string
  reuseActiveApiKey?: boolean
  defaultModel: string
}

export interface TestProviderResult {
  ok: boolean
  message: string
  resolvedBaseURL: string
  resolvedModel: string
}

interface BaseStreamEvent {
  seq?: number
  content?: string
  error?: string
  message?: Message
  stepName?: string
  toolName?: string
  confirmationId?: string
  citations?: AgentCitation[]
  metadata?: Record<string, unknown>
}

export interface MessageStartStreamEvent extends BaseStreamEvent {
  type: 'message_start'
  message: Message
}

export interface MessageDeltaStreamEvent extends BaseStreamEvent {
  type: 'delta' | 'message_delta'
  content: string
}

export interface ReasoningStreamEvent extends BaseStreamEvent {
  type: 'reasoning_start' | 'reasoning_delta' | 'reasoning_done'
  content?: string
}

export interface CompletedStreamEvent extends BaseStreamEvent {
  type: 'done' | 'cancelled'
  message?: Message
}

export interface ErrorStreamEvent extends BaseStreamEvent {
  type: 'error'
  error?: string
  message?: Message
}

export interface RunStartedStreamEvent extends BaseStreamEvent {
  type: 'run_started'
}

export interface WorkflowStepStreamEvent extends BaseStreamEvent {
  type: 'workflow_step_started' | 'workflow_step_completed'
  stepName?: string
}

export interface RetrievalStreamEvent extends BaseStreamEvent {
  type: 'retrieval_started' | 'retrieval_completed'
}

export interface ToolCallStreamEvent extends BaseStreamEvent {
  type: 'tool_call_started' | 'tool_call_completed'
}

export interface ToolCallConfirmationStreamEvent extends BaseStreamEvent {
  type: 'tool_call_confirmation_required'
}

export type StreamEvent =
  | MessageStartStreamEvent
  | MessageDeltaStreamEvent
  | ReasoningStreamEvent
  | CompletedStreamEvent
  | ErrorStreamEvent
  | RunStartedStreamEvent
  | WorkflowStepStreamEvent
  | RetrievalStreamEvent
  | ToolCallStreamEvent
  | ToolCallConfirmationStreamEvent

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
  attachmentRetentionDays: number
}

export interface AttachmentPurgePayload {
  scope: 'user' | 'all'
  userId?: number
}

export interface AttachmentPurgeResult {
  deletedCount: number
}

export interface RAGProviderPreset {
  id: number
  name: string
  baseURL: string
  hasApiKey: boolean
  apiKeyHint: string
  embeddingModel: string
  rerankerModel: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RAGProviderFallbackState {
  available: boolean
  name: string
  baseURL: string
  embeddingModel: string
  rerankerModel: string
}

export interface RAGProviderState {
  presets: RAGProviderPreset[]
  activePresetId: number | null
  currentSource: 'preset' | 'fallback' | 'none'
  fallback: RAGProviderFallbackState
}

export interface CreateRAGProviderPayload {
  name: string
  baseURL: string
  apiKey: string
  embeddingModel: string
  rerankerModel: string
}

export interface KnowledgeSpace {
  id: number
  userId: number
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: number
  userId: number
  knowledgeSpaceId: number
  title: string
  sourceType: string
  sourceUri: string
  mimeType: string
  content: string
  status: string
  chunkCount: number
  lastIndexedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateKnowledgeSpacePayload {
  name: string
  description?: string
}

export interface UpdateKnowledgeSpacePayload {
  name?: string
  description?: string
}

export interface CreateKnowledgeDocumentPayload {
  title: string
  sourceType: string
  sourceUri?: string
  content: string
}

export interface UpdateKnowledgeDocumentPayload {
  title?: string
  sourceUri?: string
  content?: string
}

export interface WorkflowNode {
  type: 'input' | 'retrieve' | 'tool' | 'prompt' | 'finalize'
  name: string
  toolName?: string
  promptHint?: string
}

export interface WorkflowTemplate {
  key: string
  name: string
  description: string
  nodes: WorkflowNode[]
}

export interface WorkflowPreset {
  id: number
  userId: number
  name: string
  templateKey: string
  defaultInputs: Record<string, unknown>
  knowledgeSpaceIds: number[]
  toolEnablements: Record<string, boolean>
  outputMode: string
  createdAt: string
  updatedAt: string
}

export interface CreateWorkflowPresetPayload {
  name: string
  templateKey: string
  defaultInputs?: Record<string, unknown>
  knowledgeSpaceIds?: number[]
  toolEnablements?: Record<string, boolean>
  outputMode?: string
}

export interface UpdateWorkflowPresetPayload {
  name?: string
  templateKey?: string
  defaultInputs?: Record<string, unknown>
  knowledgeSpaceIds?: number[]
  toolEnablements?: Record<string, boolean>
  outputMode?: string
}
