import type { Conversation } from '../../../../types/chat'
import {
  applyConversationFilters,
  dedupeConversations,
  getAvailableConversationTags,
  matchesConversationFilters,
  sortConversations,
  SIDEBAR_UNFILED_FOLDER_KEY,
} from '../../utils'

interface ConversationListFilterState {
  showArchived: boolean
  conversationSearch: string
  selectedFolder: string | null
  selectedTags: string[]
}

export function pruneSelectedConversationIds(
  selectedConversationIds: Conversation['id'][],
  conversations: Conversation[],
) {
  const visibleIds = new Set(conversations.map((conversation) => conversation.id))
  return selectedConversationIds.filter((conversationId) =>
    visibleIds.has(conversationId),
  )
}

export function deriveVisibleConversations(
  loadedConversations: Conversation[],
  state: ConversationListFilterState,
) {
  return applyConversationFilters(loadedConversations, {
    showArchived: state.showArchived,
    search: state.conversationSearch,
    selectedFolder: state.selectedFolder,
    selectedTags: state.selectedTags,
  })
}

export function reconcileConversationFilterState(
  loadedConversations: Conversation[],
  showArchived: boolean,
  selectedFolder: string | null,
  selectedTags: string[],
) {
  const nextSelectedFolder =
    selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY ||
    selectedFolder == null ||
    loadedConversations.some(
      (conversation) => conversation.folder.trim() === selectedFolder,
    ) ||
    (selectedFolder === SIDEBAR_UNFILED_FOLDER_KEY &&
      loadedConversations.some((conversation) => conversation.folder.trim() === ''))
      ? selectedFolder
      : null

  const availableTags = getAvailableConversationTags(
    loadedConversations.filter(
      (conversation) => conversation.isArchived === showArchived,
    ),
    nextSelectedFolder,
  )
  const nextSelectedTags = selectedTags.filter((tag) =>
    availableTags.some((value) => value.toLowerCase() === tag.toLowerCase()),
  )

  return {
    selectedFolder: nextSelectedFolder,
    selectedTags: nextSelectedTags,
  }
}

export function resolvePageConversations({
  activeConversation,
  activeConversationId,
  append,
  conversations,
  search,
  showArchived,
}: {
  activeConversation: Conversation | null
  activeConversationId: Conversation['id'] | null
  append: boolean
  conversations: Conversation[]
  search: string
  showArchived: boolean
}) {
  if (append) {
    return sortConversations(dedupeConversations(conversations))
  }

  const nextConversations = [...conversations]

  if (
    activeConversation &&
    activeConversation.id === activeConversationId &&
    !nextConversations.some(
      (conversation) => conversation.id === activeConversation.id,
    ) &&
    activeConversation.isArchived === showArchived &&
    matchesConversationFilters(activeConversation, {
      showArchived,
      search,
    })
  ) {
    nextConversations.unshift(activeConversation)
  }

  return sortConversations(dedupeConversations(nextConversations))
}
