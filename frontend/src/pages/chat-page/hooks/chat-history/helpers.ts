import type {
  ConversationMessagesResponse,
  Message,
} from '../../../../types/chat'
import { dedupeMessages } from '../../utils'

export function resolveHistoryPagination(
  response: Pick<ConversationMessagesResponse, 'pagination'>,
) {
  return {
    hasMoreMessages: response.pagination?.hasMore ?? false,
    nextBeforeMessageId: response.pagination?.nextBeforeId ?? null,
  }
}

export function hasStreamingAssistantMessage(messages: Message[]) {
  return messages.some(
    (message) =>
      message.role === 'assistant' && message.status === 'streaming',
  )
}

export function mergeOlderHistoryMessages(
  olderMessages: Message[],
  currentMessages: Message[],
) {
  return dedupeMessages([...olderMessages, ...currentMessages])
}
