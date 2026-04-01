import { createLocalISOString } from '../../../../lib/utils'
import type {
  Attachment,
  Conversation,
  ConversationSettings,
  Message,
} from '../../../../types/chat'
import { defaultAgentRunSummary } from '../../types'

export function buildSubmittedGenerationSettings(
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

export function resolveSavedGenerationSettings(
  currentConversation: Conversation | null,
  settingsDraft: ConversationSettings,
) {
  return currentConversation?.settings ?? settingsDraft
}

export function markAssistantMessageAsFailed(
  messages: Message[],
  assistantId: number,
  fallbackContent: string,
) {
  return messages.map((message) => {
    if (message.id !== assistantId) {
      return message
    }

    return {
      ...message,
      status: 'failed' as const,
      content: message.content || fallbackContent,
    }
  })
}

export function resetAssistantGenerationMessage(message: Message): Message {
  return {
    ...message,
    content: '',
    reasoningContent: '',
    attachments: [],
    status: 'streaming',
    localReasoningStartedAt: undefined,
    localReasoningCompletedAt: undefined,
  }
}

export function createOptimisticUserMessage(
  conversationId: Conversation['id'],
  content: string,
  attachments: Attachment[],
): Message {
  return {
    id: -Date.now(),
    conversationId,
    role: 'user',
    content,
    reasoningContent: '',
    attachments,
    status: 'completed',
    runSummary: defaultAgentRunSummary,
    createdAt: createLocalISOString(),
  }
}

export function createOptimisticAssistantMessage(
  conversationId: Conversation['id'],
  assistantId: number,
): Message {
  return {
    id: assistantId,
    conversationId,
    role: 'assistant',
    content: '',
    reasoningContent: '',
    attachments: [],
    status: 'streaming',
    runSummary: defaultAgentRunSummary,
    createdAt: createLocalISOString(),
  }
}
