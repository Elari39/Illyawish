import type { I18nContextValue } from '../../i18n/context'
import { ApiError } from '../../lib/http'
import { formatDateTime } from '../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  ImportConversationPayload,
  Message,
  ProviderPreset,
  ProviderState,
} from '../../types/chat'
import type {
  ComposerAttachment,
  ProviderEditorMode,
  ProviderFormErrors,
  ProviderFormState,
} from './types'
import {
  ATTACHMENT_INPUT_ACCEPT,
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  LAST_CONVERSATION_STORAGE_KEY,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
} from './types'

interface ConversationFilter {
  showArchived: boolean
  search: string
}

interface ConversationMutationResult {
  conversations: Conversation[]
  totalDelta: number
  loadedDelta: number
}

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
    !matchesConversationFilters(conversation, {
      showArchived,
      search,
    })
  ) {
    return sortConversations(filtered)
  }
  return sortConversations([conversation, ...filtered])
}

export function matchesConversationFilters(
  conversation: Conversation,
  { showArchived, search }: ConversationFilter,
) {
  const normalizedSearch = search.trim().toLowerCase()

  return (
    conversation.isArchived === showArchived &&
    (!normalizedSearch ||
      conversation.title.toLowerCase().includes(normalizedSearch) ||
      conversation.folder.toLowerCase().includes(normalizedSearch) ||
      conversation.tags.some((tag) =>
        tag.toLowerCase().includes(normalizedSearch),
      ))
  )
}

export function parseConversationTagsInput(value: string) {
  const seen = new Set<string>()
  const tags: string[] = []

  for (const item of value.split(',')) {
    const tag = item.trim()
    const normalizedTag = tag.toLowerCase()
    if (!tag || seen.has(normalizedTag)) {
      continue
    }

    seen.add(normalizedTag)
    tags.push(tag)
  }

  return tags
}

export function dedupeMessages(messages: Message[]) {
  const uniqueById = new Map<number, Message>()
  for (const message of messages) {
    uniqueById.set(message.id, message)
  }

  return Array.from(uniqueById.values()).sort((left, right) => left.id - right.id)
}

export function applyConversationSync(
  conversations: Conversation[],
  conversation: Conversation,
  filter: ConversationFilter,
  options: {
    countAsNew?: boolean
  } = {},
): ConversationMutationResult {
  const previousConversations = conversations.filter(
    (item) => item.id !== conversation.id,
  )
  const wasVisible = previousConversations.length !== conversations.length
  const isVisible = matchesConversationFilters(conversation, filter)

  if (!isVisible) {
    return {
      conversations: sortConversations(previousConversations),
      totalDelta: wasVisible ? -1 : 0,
      loadedDelta: wasVisible ? -1 : 0,
    }
  }

  return {
    conversations: sortConversations([conversation, ...previousConversations]),
    totalDelta: !wasVisible && options.countAsNew ? 1 : 0,
    loadedDelta: 0,
  }
}

export function applyConversationRemoval(
  conversations: Conversation[],
  conversationId: number,
): ConversationMutationResult {
  const nextConversations = conversations.filter(
    (conversation) => conversation.id !== conversationId,
  )
  const removed = nextConversations.length !== conversations.length

  return {
    conversations: nextConversations,
    totalDelta: removed ? -1 : 0,
    loadedDelta: removed ? -1 : 0,
  }
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

export function isImageAttachment(attachment: Pick<Attachment, 'mimeType'>) {
  return attachment.mimeType.startsWith('image/')
}

export function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${size} B`
}

export function resolveAttachmentMimeType(file: File) {
  const fileType = file.type.trim()
  if (fileType) {
    return fileType
  }

  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return 'text/markdown'
  }
  if (lowerName.endsWith('.txt')) {
    return 'text/plain'
  }
  return ''
}

export function isSupportedAttachmentFile(file: File) {
  const mimeType = resolveAttachmentMimeType(file)
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/plain'
  )
}

export function cleanupComposerAttachments(attachments: ComposerAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.revokeOnCleanup && attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
  }
}

export function createComposerAttachmentsFromMessageAttachments(
  attachments: Attachment[],
) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    previewUrl: isImageAttachment(attachment) ? attachment.url : undefined,
    attachment,
    revokeOnCleanup: false,
  }))
}

export async function buildAttachmentPayload(
  attachments: ComposerAttachment[],
  t: I18nContextValue['t'],
) {
  return attachments.map((attachment) => {
    if (!attachment.attachment) {
      throw new Error(
        attachment.name
          ? t('error.uploadAttachment', { name: attachment.name })
          : t('error.uploadAttachmentGeneric'),
      )
    }

    return attachment.attachment
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
    `${t('markdown.updated')}: ${formatDateTime(conversation.updatedAt, locale)}`,
    '',
  ]

  for (const message of messages) {
    lines.push(
      `## ${message.role === 'user' ? t('markdown.user') : t('markdown.assistant')}`,
    )
    lines.push('')

    if (message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        lines.push(
          isImageAttachment(attachment)
            ? `![${attachment.name}](${attachment.url})`
            : `[${attachment.name}](${attachment.url})`,
        )
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
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function buildConversationExportFilename(
  title: string | null | undefined,
  fallbackTitle: string,
) {
  const cleanedTitle = cleanConversationFileBaseName(title)
  const cleanedFallback = cleanConversationFileBaseName(fallbackTitle)
  const baseName = cleanedTitle || cleanedFallback || 'conversation'

  if (/\.md$/i.test(baseName)) {
    return baseName
  }

  return `${baseName}.md`
}

export function parseConversationMarkdownImport(
  content: string,
  filename: string,
  fallbackTitle: string,
): ImportConversationPayload {
  const normalizedContent = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalizedContent.split('\n')
  const messages: ImportConversationPayload['messages'] = []
  let title = ''
  let model = ''
  let activeRole: ImportConversationPayload['messages'][number]['role'] | null = null
  let activeLines: string[] = []

  for (const line of lines) {
    if (!title) {
      const titleMatch = line.match(/^#\s+(.+?)\s*$/)
      if (titleMatch) {
        title = titleMatch[1] ?? ''
        continue
      }
    }

    const headingMatch = line.match(/^##\s+(.+?)\s*$/)
    if (headingMatch) {
      const nextRole = resolveImportedMessageRole(headingMatch[1] ?? '')
      if (nextRole) {
        flushImportedMessage(messages, activeRole, activeLines)
        activeRole = nextRole
        activeLines = []
        continue
      }
    }

    if (!activeRole) {
      const modelMatch = line.match(/^(Model|模型|モデル):\s*(.+?)\s*$/)
      if (modelMatch) {
        model = modelMatch[2] ?? ''
      }
      continue
    }

    activeLines.push(line)
  }

  flushImportedMessage(messages, activeRole, activeLines)

  if (messages.length === 0) {
    throw new Error('No importable messages were found in the selected Markdown file.')
  }

  const resolvedTitle =
    cleanConversationFileBaseName(title) ||
    cleanConversationFileBaseName(stripConversationImportExtension(filename)) ||
    cleanConversationFileBaseName(fallbackTitle) ||
    'conversation'

  return {
    title: resolvedTitle,
    settings: model.trim() ? { model: model.trim() } : undefined,
    messages,
  }
}

function cleanConversationFileBaseName(value: string | null | undefined) {
  return stripControlCharacters(value ?? '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(\.md)$/i, '$1')
    .replace(/^[.\s]+|[.\s]+$/g, '')
}

function stripControlCharacters(value: string) {
  let result = ''

  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint != null &&
      ((codePoint >= 0x00 && codePoint <= 0x1f) || codePoint === 0x7f)
    ) {
      continue
    }
    result += character
  }

  return result
}

function resolveImportedMessageRole(value: string) {
  const label = value.trim()
  if (label === 'User' || label === '用户' || label === 'ユーザー') {
    return 'user'
  }
  if (label === 'Assistant' || label === '助手' || label === 'アシスタント') {
    return 'assistant'
  }
  return null
}

function flushImportedMessage(
  messages: ImportConversationPayload['messages'],
  role: ImportConversationPayload['messages'][number]['role'] | null,
  lines: string[],
) {
  if (!role) {
    return
  }

  const content = trimSectionBlankLines(lines.join('\n'))
  if (!content) {
    return
  }

  messages.push({
    role,
    content,
  })
}

function trimSectionBlankLines(value: string) {
  const lines = value.split('\n')

  while (lines.length > 0 && lines[0]?.trim() === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop()
  }

  return lines.join('\n')
}

function stripConversationImportExtension(filename: string) {
  return filename.replace(/\.(md|markdown|txt)$/i, '')
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
      models: resolveProviderModelDraft(preset.models, preset.defaultModel),
      defaultModel: preset.defaultModel,
      errors: createProviderFormErrors(),
    }
  }

  const fallbackModels = resolveProviderModelDraft(
    fallback?.models ?? [],
    fallback?.defaultModel ?? '',
  )
  const fallbackDefaultModel = resolveDefaultModelValue(
    fallbackModels,
    fallback?.defaultModel ?? '',
  )

  return {
    name: '',
    baseURL: fallback?.baseURL || OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
    apiKey: '',
    models: fallbackModels.length > 0 ? fallbackModels : [''],
    defaultModel: fallbackDefaultModel,
    errors: createProviderFormErrors(),
  }
}

export function createProviderFormErrors(): ProviderFormErrors {
  return {
    modelItems: [],
  }
}

export function resolveProviderEditorState(
  providerState: ProviderState,
  preferredMode: ProviderEditorMode,
) {
  const activePreset =
    providerState.presets.find((preset) => preset.isActive) ?? null

  if (preferredMode.type === 'new') {
    return {
      editingProviderId: null,
      providerEditorMode: preferredMode,
      providerForm: createProviderForm(providerState.fallback),
    }
  }

  if (preferredMode.type === 'edit') {
    const preferredPreset =
      providerState.presets.find(
        (preset) => preset.id === preferredMode.providerId,
      ) ?? null
    if (preferredPreset) {
      return {
        editingProviderId: preferredPreset.id,
        providerEditorMode: preferredMode,
        providerForm: createProviderForm(providerState.fallback, preferredPreset),
      }
    }
  }

  const nextPreset = activePreset

  return {
    editingProviderId: nextPreset?.id ?? null,
    providerEditorMode: { type: 'auto' } as const,
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

export function normalizeModelEntries(models: string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const model of models) {
    const trimmed = model.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  return normalized
}

export function resolveDefaultModelValue(
  models: string[],
  defaultModel: string,
) {
  const normalizedModels = normalizeModelEntries(models)
  const trimmedDefaultModel = defaultModel.trim()

  if (normalizedModels.length === 0) {
    return ''
  }

  if (!trimmedDefaultModel) {
    return normalizedModels[0] ?? ''
  }
  if (normalizedModels.includes(trimmedDefaultModel)) {
    return trimmedDefaultModel
  }
  return normalizedModels[0] ?? trimmedDefaultModel
}

export function resolveProviderModelDraft(
  models: string[],
  defaultModel: string,
) {
  const normalizedModels = normalizeModelEntries(models)
  const trimmedDefaultModel = defaultModel.trim()

  if (!trimmedDefaultModel) {
    return normalizedModels.length > 0 ? normalizedModels : ['']
  }
  if (normalizedModels.includes(trimmedDefaultModel)) {
    return normalizedModels
  }
  return [trimmedDefaultModel, ...normalizedModels]
}

export function resolveChatModelOptions(
  providerState: ProviderState | null,
  currentModel: string,
) {
  const activePreset =
    providerState?.presets.find((preset) => preset.isActive) ?? null
  const sourceModels = activePreset?.models ?? providerState?.fallback.models ?? []
  const normalizedModels = normalizeModelEntries(sourceModels)
  const trimmedCurrentModel = currentModel.trim()

  if (
    trimmedCurrentModel &&
    !normalizedModels.includes(trimmedCurrentModel)
  ) {
    return [trimmedCurrentModel, ...normalizedModels]
  }

  return normalizedModels
}

export function hasProviderFormErrors(errors: ProviderFormErrors) {
  return Boolean(
    errors.name ||
      errors.baseURL ||
      errors.apiKey ||
      errors.models ||
      errors.defaultModel ||
      errors.modelItems.some((message) => Boolean(message)),
  )
}

export function validateProviderForm(
  form: ProviderFormState,
  options: {
    requireAPIKey: boolean
    t: I18nContextValue['t']
  },
) {
  const errors = createProviderFormErrors()
  const { requireAPIKey, t } = options

  if (!form.name.trim()) {
    errors.name = t('settings.validationPresetNameRequired')
  }
  if (!form.baseURL.trim()) {
    errors.baseURL = t('settings.validationBaseUrlRequired')
  }
  if (requireAPIKey && !form.apiKey.trim()) {
    errors.apiKey = t('settings.validationApiKeyRequired')
  }

  errors.modelItems = form.models.map((model) =>
    model.trim() ? '' : t('settings.validationModelRequired'),
  )

  const normalizedModels = normalizeModelEntries(form.models)
  const defaultModel = form.defaultModel.trim()

  if (normalizedModels.length === 0) {
    errors.models = t('settings.validationModelListRequired')
  }
  if (!defaultModel) {
    errors.defaultModel = t('settings.validationDefaultModelRequired')
  } else if (!normalizedModels.includes(defaultModel)) {
    errors.defaultModel = t('settings.validationDefaultModelInvalid')
  }

  return {
    defaultModel,
    errors,
    normalizedModels,
  }
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

export function createAttachmentDraft(file: File): ComposerAttachment {
  const mimeType = resolveAttachmentMimeType(file)
  return {
    id: `${file.name}-${file.lastModified}-${Date.now()}`,
    name: file.name,
    mimeType,
    size: file.size,
    previewUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    file,
    isUploading: true,
    revokeOnCleanup: mimeType.startsWith('image/'),
  }
}

export { ATTACHMENT_INPUT_ACCEPT }

export function mergeConversationSettings(
  previous: ConversationSettings,
  next: Partial<ConversationSettings>,
) {
  return {
    ...previous,
    ...next,
  }
}
