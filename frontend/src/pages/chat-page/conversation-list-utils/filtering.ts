import type { Conversation } from '../../../types/chat'
import { dedupeConversations, sortConversations } from './catalog'

export interface ConversationFilter {
  showArchived: boolean
  search: string
  selectedFolder?: string | null
  selectedTags?: string[]
}

export interface ConversationMutationResult {
  conversations: Conversation[]
  totalDelta: number
  loadedDelta: number
}

export const SIDEBAR_UNFILED_FOLDER_KEY = '__sidebar_unfiled__'

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
  {
    showArchived,
    search,
    selectedFolder = null,
    selectedTags = [],
  }: ConversationFilter,
) {
  const normalizedSearch = search.trim().toLowerCase()
  const normalizedFolder = conversation.folder.trim()
  const matchesFolder =
    selectedFolder == null
      ? true
      : selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY
        ? normalizedFolder === ''
        : normalizedFolder === selectedFolder
  const matchesTags =
    selectedTags.length === 0 ||
    selectedTags.some((tag) =>
      conversation.tags.some(
        (conversationTag) =>
          conversationTag.toLowerCase() === tag.toLowerCase(),
      ),
    )

  return (
    conversation.isArchived === showArchived &&
    matchesFolder &&
    matchesTags &&
    (!normalizedSearch ||
      conversation.title.toLowerCase().includes(normalizedSearch) ||
      conversation.folder.toLowerCase().includes(normalizedSearch) ||
      conversation.tags.some((tag) =>
        tag.toLowerCase().includes(normalizedSearch),
      ))
  )
}

export function applyConversationFilters(
  conversations: Conversation[],
  filter: ConversationFilter,
) {
  return sortConversations(
    conversations.filter((conversation) =>
      matchesConversationFilters(conversation, filter),
    ),
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
    updateCountsForVisibilityChange?: boolean
    allowInsertionWhenSearching?: boolean
  } = {},
): ConversationMutationResult {
  const previousConversations = conversations.filter(
    (item) => item.id !== conversation.id,
  )
  const wasVisible = previousConversations.length !== conversations.length
  const normalizedSearch = filter.search.trim()
  const matchesLocalFilters = matchesConversationFilters(conversation, filter)
  const matchesArchiveFilter = conversation.isArchived === filter.showArchived

  if (normalizedSearch !== '') {
    if (!matchesArchiveFilter) {
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

    if (!options.allowInsertionWhenSearching) {
      return {
        conversations: sortConversations(previousConversations),
        totalDelta: 0,
        loadedDelta: 0,
      }
    }
  }

  if (!matchesLocalFilters) {
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

  return {
    conversations: sortConversations([conversation, ...previousConversations]),
    totalDelta:
      !wasVisible &&
      (options.countAsNew || options.updateCountsForVisibilityChange)
        ? 1
        : 0,
    loadedDelta:
      !wasVisible &&
      !options.countAsNew &&
      options.updateCountsForVisibilityChange
        ? 1
        : 0,
  }
}

export function applyConversationRemoval(
  conversations: Conversation[],
  conversationId: Conversation['id'],
): ConversationMutationResult {
  const nextConversations = conversations.filter(
    (conversation) => conversation.id !== conversationId,
  )
  const removed = nextConversations.length !== conversations.length

  return {
    conversations: dedupeConversations(nextConversations),
    totalDelta: removed ? -1 : 0,
    loadedDelta: removed ? -1 : 0,
  }
}
