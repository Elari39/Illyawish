import type { Conversation } from '../../../types/chat'

import { parseConversationTagsInput } from '../utils'

export function resolveConversationForList(conversation: Conversation) {
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
