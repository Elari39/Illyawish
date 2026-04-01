import type {
  AgentRunSummary,
  Attachment,
  ChatSettings,
  ConversationSettings,
  ProviderFormat,
} from '../../types/chat'

export const MAX_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
export const ATTACHMENT_INPUT_ACCEPT =
  'image/*,.pdf,.md,.markdown,.txt,text/plain,text/markdown,application/pdf'
export const IMPORT_CONVERSATION_INPUT_ACCEPT =
  '.md,.markdown,.txt,text/plain,text/markdown'
export const CONVERSATION_PAGE_SIZE = 20
export const LAST_CONVERSATION_STORAGE_KEY = 'aichat:last-conversation-public-id'
export const DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY =
  'aichat:desktop-sidebar-collapsed'
export const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderFormat, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
}

export interface ComposerAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  previewUrl?: string
  attachment?: Attachment
  file?: File
  isUploading?: boolean
  revokeOnCleanup: boolean
}

export type SettingsTab =
  | 'chat'
  | 'history'
  | 'provider'
  | 'rag'
  | 'knowledge'
  | 'workflow'
  | 'security'
  | 'language'
  | 'transfer'

export interface ProviderFormErrors {
  format?: string
  name?: string
  baseURL?: string
  apiKey?: string
  models?: string
  modelItems: string[]
  defaultModel?: string
}

export interface ProviderFormState {
  name: string
  format: ProviderFormat
  baseURL: string
  apiKey: string
  models: string[]
  defaultModel: string
  errors: ProviderFormErrors
}

export type ProviderEditorMode =
  | { type: 'auto' }
  | { type: 'new' }
  | { type: 'edit'; providerId: number }

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastState {
  id: number
  message: string
  variant: ToastVariant
  durationMs?: number
  remainingMs?: number
  closeAt?: number
  isPaused?: boolean
}

export interface ChatErrorState {
  id: number
  message: string
}

export interface ConfirmationState {
  title: string
  description?: string
  confirmLabel: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void | Promise<void>
}

export interface PromptState {
  title: string
  initialValue: string
  confirmLabel: string
  onSubmit: (value: string) => void | Promise<void>
}

export const defaultConversationSettings: ConversationSettings = {
  systemPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: null,
  maxTokens: null,
  contextWindowTurns: null,
}

export const defaultAgentRunSummary: AgentRunSummary = {
  workflowTemplateKey: '',
  workflowPresetId: null,
  knowledgeSpaceIds: [],
  toolCalls: [],
  citations: [],
}

export const defaultChatSettings: ChatSettings = {
  globalPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}
