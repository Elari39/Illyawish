import type { Conversation } from '../../../types/chat'

import { parseConversationTagsInput } from '../utils'

export function resolveConversationForList(
  conversation: Conversation,
  showArchived: boolean,
  search: string,
) {
  if (
    conversation.isArchived !== showArchived ||
    (search && !matchesConversationSearch(conversation, search))
  ) {
    return {
      ...conversation,
      isArchived: conversation.isArchived,
    }
  }

  return conversation
}

export function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs)
  })
}

export function buildConversationMetadataUpdate(
  folderDraft: string,
  tagsDraft: string,
) {
  const folder = folderDraft.trim()
  const tags = parseConversationTagsInput(tagsDraft)

  return {
    ...(folder ? { folder } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }
}

function matchesConversationSearch(conversation: Conversation, search: string) {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) {
    return true
  }

  return (
    conversation.title.toLowerCase().includes(normalizedSearch) ||
    conversation.folder.toLowerCase().includes(normalizedSearch) ||
    conversation.tags.some((tag) =>
      tag.toLowerCase().includes(normalizedSearch),
    )
  )
}
