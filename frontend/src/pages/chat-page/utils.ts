import type { I18nContextValue } from '../../i18n/context'
import { ApiError } from '../../lib/http'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
  ProviderPreset,
  ProviderState,
} from '../../types/chat'
import type {
  ComposerImage,
  ProviderFormState,
} from './types'
import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  LAST_CONVERSATION_STORAGE_KEY,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
} from './types'

export function appendToStreamingMessage(messages: Message[], content: string) {
  const nextMessages = [...messages]
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const candidate = nextMessages[index]
    if (candidate.role === 'assistant' && candidate.status === 'streaming') {
      nextMessages[index] = {
        ...candidate,
        content: candidate.content + content,
      }
      return nextMessages
    }
  }
  return messages
}

export function upsertMessage(
  messages: Message[],
  message: Message,
  placeholderId: number,
) {
  let replaced = false
  const nextMessages = messages.map((item) => {
    if (item.id === placeholderId || item.id === message.id) {
      replaced = true
      return message
    }
    return item
  })

  return replaced ? nextMessages : [...nextMessages, message]
}

export function isSameMessage(
  left: Message,
  right: Message | undefined,
  placeholderId: number,
) {
  if (!right) {
    return left.id === placeholderId
  }
  return left.id === right.id || left.id === placeholderId
}

export function dedupeConversations(conversations: Conversation[]) {
  const unique = new Map<number, Conversation>()
  for (const conversation of conversations) {
    unique.set(conversation.id, conversation)
  }
  return Array.from(unique.values())
}

export function syncConversationList(
  conversations: Conversation[],
  conversation: Conversation,
  showArchived: boolean,
  search: string,
) {
  const filtered = conversations.filter((item) => item.id !== conversation.id)
  if (
    conversation.isArchived !== showArchived ||
    (search &&
      !conversation.title.toLowerCase().includes(search.toLowerCase()))
  ) {
    return sortConversations(filtered)
  }
  return sortConversations([conversation, ...filtered])
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function findLatestMessageByRole(
  messages: Message[],
  role: Message['role'],
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index]
    }
  }
  return null
}

export function cleanupComposerImages(images: ComposerImage[]) {
  for (const image of images) {
    if (image.revokeOnCleanup) {
      URL.revokeObjectURL(image.previewUrl)
    }
  }
}

export function createComposerImagesFromAttachments(attachments: Attachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    previewUrl: attachment.url,
    attachment,
    revokeOnCleanup: false,
  }))
}

export async function buildAttachmentPayload(
  images: ComposerImage[],
  t: I18nContextValue['t'],
) {
  return images.map((image) => {
    if (!image.attachment) {
      throw new Error(
        image.name
          ? t('error.uploadImage', { name: image.name })
          : t('error.uploadImageGeneric'),
      )
    }

    return image.attachment
  })
}

export function formatMessageTimestamp(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function buildConversationMarkdown(
  conversation: Conversation,
  messages: Message[],
  locale: string,
  t: I18nContextValue['t'],
) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `${t('markdown.model')}: ${conversation.settings.model || t('chat.defaultModel')}`,
    `${t('markdown.updated')}: ${new Date(conversation.updatedAt).toLocaleString(locale)}`,
    '',
  ]

  for (const message of messages) {
    lines.push(
      `## ${message.role === 'user' ? t('markdown.user') : t('markdown.assistant')}`,
    )
    lines.push('')

    if (message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        lines.push(`![${attachment.name}](${attachment.url})`)
      }
      lines.push('')
    }

    if (message.content) {
      lines.push(message.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function createProviderForm(
  fallback?: ProviderState['fallback'],
  preset?: ProviderPreset | null,
): ProviderFormState {
  if (preset) {
    return {
      name: preset.name,
      baseURL: preset.baseURL,
      apiKey: '',
      defaultModel: preset.defaultModel,
    }
  }

  return {
    name: '',
    baseURL: fallback?.baseURL || OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
    apiKey: '',
    defaultModel: fallback?.defaultModel || '',
  }
}

export function resolveProviderEditorState(
  providerState: ProviderState,
  preferredPresetId: number | null,
) {
  const preferredPreset =
    providerState.presets.find((preset) => preset.id === preferredPresetId) ?? null
  const activePreset =
    providerState.presets.find((preset) => preset.isActive) ?? null
  const nextPreset = preferredPreset ?? activePreset

  return {
    editingProviderId: nextPreset?.id ?? null,
    providerForm: createProviderForm(providerState.fallback, nextPreset),
  }
}

export function describeProviderSource(
  providerState: ProviderState | null,
  activePreset: ProviderPreset | null,
  t: I18nContextValue['t'],
) {
  if (!providerState) {
    return t('provider.loadingStatus')
  }

  if (providerState.currentSource === 'preset' && activePreset) {
    return t('provider.usingPreset', {
      name: activePreset.name,
      model: activePreset.defaultModel,
    })
  }

  if (providerState.currentSource === 'fallback') {
    return providerState.fallback.available
      ? t('provider.usingFallbackModel', {
          model: providerState.fallback.defaultModel,
        })
      : t('provider.usingFallback')
  }

  return t('provider.notConfigured')
}

export function readDesktopSidebarCollapsedPreference() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const rawValue = window.localStorage.getItem(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
    )
    return rawValue ? JSON.parse(rawValue) === true : false
  } catch {
    return false
  }
}

export function readLastConversationId() {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(LAST_CONVERSATION_STORAGE_KEY)
  const conversationId = Number(rawValue)
  return Number.isInteger(conversationId) && conversationId > 0
    ? conversationId
    : null
}

export function writeLastConversationId(conversationId: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    LAST_CONVERSATION_STORAGE_KEY,
    String(conversationId),
  )
}

export function clearLastConversationId(conversationId?: number) {
  if (typeof window === 'undefined') {
    return
  }

  const storedConversationId = readLastConversationId()
  if (
    typeof conversationId === 'number' &&
    storedConversationId != null &&
    storedConversationId !== conversationId
  ) {
    return
  }

  window.localStorage.removeItem(LAST_CONVERSATION_STORAGE_KEY)
}

export function resolveRestorableConversationId(
  conversations: Conversation[],
  lastConversationId: number | null,
  showArchived: boolean,
  search: string,
) {
  if (showArchived || search !== '' || lastConversationId == null) {
    return null
  }

  return conversations.some((conversation) => conversation.id === lastConversationId)
    ? lastConversationId
    : null
}

export function isConversationNotFoundError(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

export function getConversationMonogram(title: string) {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) {
    return 'C'
  }

  return trimmedTitle[0]?.toUpperCase() ?? 'C'
}

export function createImageDraft(file: File): ComposerImage {
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}`,
    name: file.name,
    mimeType: file.type,
    size: file.size,
    previewUrl: URL.createObjectURL(file),
    file,
    isUploading: true,
    revokeOnCleanup: true,
  }
}

export function mergeConversationSettings(
  previous: ConversationSettings,
  next: Partial<ConversationSettings>,
) {
  return {
    ...previous,
    ...next,
  }
}
