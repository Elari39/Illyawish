import type {
  Conversation,
  Message,
  StreamEvent,
} from '../../../../types/chat'
import { updateStreamingAssistantMessage } from '../../utils'
import { writeLastEventSeq } from '../../stream-seq-storage'
import type { ActiveGenerationState } from '../chat-generation-types'

export interface MessageTarget {
  conversationId: Conversation['id']
  placeholderId: number
  messageId: number | null
}

export interface BufferedMessageDelta {
  conversationId: Conversation['id']
  placeholderId: number
  content: string
  reasoningContent: string
}

export function buildMessageTarget(
  activeGeneration: Pick<ActiveGenerationState, 'conversationId' | 'messageId'> | null,
  conversationId: Conversation['id'],
  placeholderId: number,
): MessageTarget {
  return {
    conversationId,
    placeholderId,
    messageId:
      activeGeneration?.conversationId === conversationId
        ? activeGeneration.messageId
        : null,
  }
}

export function syncStreamEventSequence(
  conversationId: Conversation['id'],
  event: StreamEvent,
) {
  if (typeof event.seq !== 'number' || event.seq <= 0) {
    return
  }

  writeLastEventSeq(conversationId, event.seq)
}

export function markReasoningStarted(
  previous: Message[],
  target: MessageTarget,
  observedAt = Date.now(),
) {
  return updateStreamingAssistantMessage(previous, target, (message) => {
    if (message.localReasoningStartedAt != null) {
      return message
    }

    return {
      ...message,
      localReasoningStartedAt: observedAt,
    }
  })
}

export function markReasoningCompleted(
  previous: Message[],
  target: MessageTarget,
  observedAt = Date.now(),
) {
  return updateStreamingAssistantMessage(previous, target, (message) => {
    if (
      message.localReasoningStartedAt == null ||
      message.localReasoningCompletedAt != null
    ) {
      return message
    }

    return {
      ...message,
      localReasoningCompletedAt: observedAt,
    }
  })
}
