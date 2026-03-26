import type { Attachment, ConversationSettings } from '../../types/chat'

export const MAX_IMAGE_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
export const CONVERSATION_PAGE_SIZE = 20
export const LAST_CONVERSATION_STORAGE_KEY = 'aichat:last-conversation-id'
export const DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY =
  'aichat:desktop-sidebar-collapsed'
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'
export const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export interface ComposerImage {
  id: string
  name: string
  mimeType: string
  size: number
  previewUrl: string
  attachment?: Attachment
  file?: File
  isUploading?: boolean
  revokeOnCleanup: boolean
}

export type SettingsTab = 'chat' | 'provider'

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
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: '',
  temperature: 1,
  maxTokens: null,
}
