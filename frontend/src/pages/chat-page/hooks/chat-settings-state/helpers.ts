import type {
  ChatSettings,
  Conversation,
  ConversationSettings,
} from '../../../../types/chat'

export function sanitizeConversationFolder(value: string) {
  return value.trim()
}

export function parseConversationTags(value: string) {
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

export function formatConversationTags(tags: string[]) {
  return tags.join(', ')
}

export function buildConversationMetadataUpdate(
  folder: string,
  tags: string[],
  knowledgeSpaceIds: number[],
  currentConversation: Conversation | null,
  includeKnowledge = true,
) {
  if (!currentConversation) {
    return {}
  }

  const folderChanged = folder !== currentConversation.folder
  const tagsChanged =
    tags.length !== currentConversation.tags.length ||
    tags.some((tag, index) => tag !== currentConversation.tags[index])
  const currentKnowledgeSpaceIds = currentConversation.knowledgeSpaceIds ?? []
  const knowledgeChanged =
    knowledgeSpaceIds.length !== currentKnowledgeSpaceIds.length ||
    knowledgeSpaceIds.some((id, index) => id !== currentKnowledgeSpaceIds[index])

  return {
    ...(folderChanged ? { folder } : {}),
    ...(tagsChanged ? { tags } : {}),
    ...(includeKnowledge && knowledgeChanged ? { knowledgeSpaceIds } : {}),
  }
}

export function buildDraftConversationSettings(
  chatSettings: ChatSettings,
  systemPrompt: string,
): ConversationSettings {
  return {
    systemPrompt,
    providerPresetId: chatSettings.providerPresetId ?? null,
    model: chatSettings.model,
    temperature: chatSettings.temperature,
    maxTokens: chatSettings.maxTokens,
    contextWindowTurns: chatSettings.contextWindowTurns,
  }
}

export function buildConversationSettingsPayload(
  settingsDraft: ConversationSettings,
): ConversationSettings {
  return {
    systemPrompt: settingsDraft.systemPrompt,
    providerPresetId: settingsDraft.providerPresetId ?? null,
    model: settingsDraft.model,
    temperature: settingsDraft.temperature,
    maxTokens: settingsDraft.maxTokens,
    contextWindowTurns: settingsDraft.contextWindowTurns,
  }
}
