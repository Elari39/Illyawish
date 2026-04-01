import type { Conversation, ConversationSettings, Message } from '../types/chat'

const defaultConversationSettings: ConversationSettings = {
  systemPrompt: '',
  providerPresetId: null,
  model: '',
  temperature: null,
  maxTokens: null,
  contextWindowTurns: null,
}

export function normalizeConversationSettings(
  settings: Partial<ConversationSettings> | null | undefined,
): ConversationSettings {
  return {
    systemPrompt:
      typeof settings?.systemPrompt === 'string'
        ? settings.systemPrompt
        : defaultConversationSettings.systemPrompt,
    providerPresetId:
      typeof settings?.providerPresetId === 'number'
        ? settings.providerPresetId
        : defaultConversationSettings.providerPresetId,
    model:
      typeof settings?.model === 'string'
        ? settings.model
        : defaultConversationSettings.model,
    temperature:
      typeof settings?.temperature === 'number' || settings?.temperature === null
        ? settings.temperature
        : defaultConversationSettings.temperature,
    maxTokens:
      typeof settings?.maxTokens === 'number' || settings?.maxTokens === null
        ? settings.maxTokens
        : defaultConversationSettings.maxTokens,
    contextWindowTurns:
      typeof settings?.contextWindowTurns === 'number' || settings?.contextWindowTurns === null
        ? settings.contextWindowTurns
        : defaultConversationSettings.contextWindowTurns,
  }
}

export function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    id: String(conversation.id) as Conversation['id'],
    folder: typeof conversation.folder === 'string' ? conversation.folder : '',
    tags: Array.isArray(conversation.tags)
      ? conversation.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    knowledgeSpaceIds: Array.isArray(conversation.knowledgeSpaceIds)
      ? conversation.knowledgeSpaceIds.filter(
          (id): id is number => typeof id === 'number' && Number.isFinite(id),
        )
      : [],
    settings: normalizeConversationSettings(conversation.settings),
  }
}

export function normalizeMessage(message: Message): Message {
  return {
    ...message,
    conversationId: String(message.conversationId),
    reasoningContent:
      typeof message.reasoningContent === 'string'
        ? message.reasoningContent
        : '',
  }
}
