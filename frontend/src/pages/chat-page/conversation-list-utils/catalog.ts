import { ApiError } from '../../../lib/http'
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from '../../../lib/storage'
import type { Conversation } from '../../../types/chat'
import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  LAST_CONVERSATION_STORAGE_KEY,
} from '../types'
import { SIDEBAR_UNFILED_FOLDER_KEY } from './filtering'

export function dedupeConversations(conversations: Conversation[]) {
  const unique = new Map<Conversation['id'], Conversation>()
  for (const conversation of conversations) {
    unique.set(conversation.id, conversation)
  }
  return Array.from(unique.values())
}

export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

export function getAvailableConversationFolders(conversations: Conversation[]) {
  return Array.from(
    new Set(
      conversations
        .map((conversation) => conversation.folder.trim())
        .filter((folder) => folder !== ''),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

export function getAvailableConversationTags(
  conversations: Conversation[],
  selectedFolder: string | null = null,
) {
  const tags = new Set<string>()
  for (const conversation of conversations) {
    const folder = conversation.folder.trim()
    const matchesFolder =
      selectedFolder == null
        ? true
        : selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY
          ? folder === ''
          : folder === selectedFolder

    if (!matchesFolder) {
      continue
    }

    for (const tag of conversation.tags) {
      const normalizedTag = tag.trim()
      if (normalizedTag !== '') {
        tags.add(normalizedTag)
      }
    }
  }

  return Array.from(tags).sort((left, right) => left.localeCompare(right))
}

export function readDesktopSidebarCollapsedPreference() {
  try {
    const rawValue = readLocalStorage(
      DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
    )
    return rawValue ? JSON.parse(rawValue) === true : false
  } catch {
    return false
  }
}

export function readLastConversationId() {
  const rawValue = readLocalStorage(LAST_CONVERSATION_STORAGE_KEY)
  return rawValue && rawValue.trim() !== '' ? rawValue : null
}

export function writeLastConversationId(conversationId: Conversation['id']) {
  writeLocalStorage(
    LAST_CONVERSATION_STORAGE_KEY,
    String(conversationId),
  )
}

export function clearLastConversationId(conversationId?: Conversation['id']) {
  const storedConversationId = readLastConversationId()
  if (
    typeof conversationId === 'string' &&
    storedConversationId != null &&
    storedConversationId !== conversationId
  ) {
    return
  }

  removeLocalStorage(LAST_CONVERSATION_STORAGE_KEY)
}

export function resolveRestorableConversationId(
  conversations: Conversation[],
  lastConversationId: Conversation['id'] | null,
  showArchived: boolean,
  search: string,
) {
  if (showArchived || search !== '' || lastConversationId == null) {
    return null
  }

  return conversations.some(
    (conversation) => conversation.id === lastConversationId,
  )
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
