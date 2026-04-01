import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
} from '../../../../types/chat'
import {
  buildConversationMetadataUpdate,
  buildDraftConversationSettings,
  formatConversationTags,
  parseConversationTags,
  sanitizeConversationFolder,
} from './helpers'

export interface ChatSettingsDraftSnapshot {
  settingsDraft: ConversationSettings
  conversationFolderDraft: string
  conversationTagsDraft: string
  knowledgeSpaceIdsDraft: number[]
}

export function buildSaveSettingsPreparation({
  conversationFolderDraft,
  conversationTagsDraft,
  currentConversation,
  knowledgeSpaceIdsDraft,
}: {
  conversationFolderDraft: string
  conversationTagsDraft: string
  currentConversation: Conversation | null
  knowledgeSpaceIdsDraft: number[]
}) {
  const nextFolder = sanitizeConversationFolder(conversationFolderDraft)
  const nextTags = parseConversationTags(conversationTagsDraft)

  return {
    nextFolder,
    nextTags,
    nextTagsInput: formatConversationTags(nextTags),
    metadataUpdate: buildConversationMetadataUpdate(
      nextFolder,
      nextTags,
      knowledgeSpaceIdsDraft,
      currentConversation,
      false,
    ),
  }
}

export function buildConversationDraftSnapshot(
  conversation: Conversation,
): ChatSettingsDraftSnapshot {
  return {
    settingsDraft: conversation.settings,
    conversationFolderDraft: conversation.folder,
    conversationTagsDraft: formatConversationTags(conversation.tags),
    knowledgeSpaceIdsDraft: conversation.knowledgeSpaceIds ?? [],
  }
}

export function buildNewChatDraftSnapshot({
  chatSettings,
  conversationFolderDraft,
  conversationTagsDraft,
  systemPrompt,
}: {
  chatSettings: ChatSettings
  conversationFolderDraft: string
  conversationTagsDraft: string
  systemPrompt: string
}): ChatSettingsDraftSnapshot {
  return {
    settingsDraft: buildDraftConversationSettings(chatSettings, systemPrompt),
    conversationFolderDraft,
    conversationTagsDraft,
    knowledgeSpaceIdsDraft: [],
  }
}

export function resolveKnowledgeSpaceToggle(
  previousIds: number[],
  spaceId: number,
) {
  return previousIds.includes(spaceId)
    ? previousIds.filter((id) => id !== spaceId)
    : [...previousIds, spaceId]
}
