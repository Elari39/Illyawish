import type { AgentRunSummary, Attachment, ChatSettings, ConversationSettings } from '../../types/chat'

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
export const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'https://api.openai.com/v1'

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
  | 'provider'
  | 'rag'
  | 'knowledge'
  | 'workflow'
  | 'security'
  | 'language'
  | 'transfer'

export interface ProviderFormErrors {
  name?: string
  baseURL?: string
  apiKey?: string
  models?: string
  modelItems: string[]
  defaultModel?: string
}

export interface ProviderFormState {
  name: string
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
  model: '',
  temperature: 1,
  maxTokens: null,
  contextWindowTurns: null,
}
