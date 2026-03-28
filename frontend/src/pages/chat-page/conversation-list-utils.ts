import { ApiError } from '../../lib/http'
import type { Conversation } from '../../types/chat'
import {
  DESKTOP_SIDEBAR_COLLAPSED_STORAGE_KEY,
  LAST_CONVERSATION_STORAGE_KEY,
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
  const matchesLocalFilters = matchesConversationFilters(conversation, filter)

  if (conversation.isArchived !== filter.showArchived) {
    return {
      conversations: sortConversations(previousConversations),
      totalDelta: wasVisible ? -1 : 0,
      loadedDelta: wasVisible ? -1 : 0,
    }
  }

  if (wasVisible) {
    return {
      conversations: sortConversations([conversation, ...previousConversations]),
      totalDelta: 0,
      loadedDelta: 0,
    }
  }

  if (!matchesLocalFilters) {
    return {
      conversations: sortConversations(previousConversations),
      totalDelta: 0,
      loadedDelta: 0,
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
