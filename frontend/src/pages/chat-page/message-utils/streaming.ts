import type { Message } from '../../../types/chat'

interface StreamingMessageTarget {
  conversationId: Message['conversationId']
  placeholderId: number
  messageId: number | null
}

type MessageWithLocalReasoning = Pick<
  Message,
  'localReasoningStartedAt' | 'localReasoningCompletedAt'
>

export function appendToStreamingMessage(
  messages: Message[],
  target: StreamingMessageTarget,
  delta: {
    content?: string
    reasoningContent?: string
  },
) {
  const nextMessages = [...messages]
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const candidate = nextMessages[index]
    if (
      candidate.role === 'assistant' &&
      candidate.status === 'streaming' &&
      isSameMessage(candidate, target)
    ) {
      nextMessages[index] = {
        ...candidate,
        content: candidate.content + (delta.content ?? ''),
        reasoningContent:
          (candidate.reasoningContent ?? '') + (delta.reasoningContent ?? ''),
      }
      return nextMessages
    }
  }
  return messages
}

export function upsertMessage(
  messages: Message[],
  message: Message,
  target: StreamingMessageTarget,
) {
  let replaced = false
  const nextMessages = messages.map((item) => {
    if (isSameMessage(item, target) || item.id === message.id) {
      replaced = true
      return mergeLocalReasoningFields(message, item)
    }
    return item
  })

  const mergedMessages = replaced ? nextMessages : [...nextMessages, message]
  return dedupeMessages(mergedMessages)
}

export function isSameMessage(
  message: Message,
  target: StreamingMessageTarget,
) {
  if (message.conversationId !== target.conversationId) {
    return false
  }

  return (
    message.id === target.placeholderId ||
    (target.messageId != null && message.id === target.messageId)
  )
}

export function dedupeMessages(messages: Message[]) {
  const uniqueById = new Map<number, Message>()
  for (const message of messages) {
    uniqueById.set(message.id, message)
  }

  return Array.from(uniqueById.values()).sort((left, right) => left.id - right.id)
}

export function mergePreservedMessages(
  messages: Message[],
  preservedMessages: Message[],
) {
  if (preservedMessages.length === 0) {
    return messages
  }

  const preservedById = new Map(
    preservedMessages.map((message) => [message.id, message]),
  )
  const mergedMessages = messages.map((message) =>
    preservedById.get(message.id) ?? message,
  )

  for (const message of preservedMessages) {
    if (!preservedById.has(message.id)) {
      continue
    }

    if (!messages.some((candidate) => candidate.id === message.id)) {
      mergedMessages.push(message)
    }
  }

  return dedupeMessages(mergedMessages)
}

export function findLatestMessageByRole(
  messages: Message[],
  role: Message['role'],
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index]
    }
  }
  return null
}

export function updateStreamingAssistantMessage(
  messages: Message[],
  target: StreamingMessageTarget,
  updater: (message: Message) => Message,
) {
  const nextMessages = [...messages]
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const candidate = nextMessages[index]
    if (
      candidate.role === 'assistant' &&
      candidate.status === 'streaming' &&
      isSameMessage(candidate, target)
    ) {
      const updatedCandidate = updater(candidate)
      if (updatedCandidate === candidate) {
        return messages
      }
      nextMessages[index] = updatedCandidate
      return nextMessages
    }
  }

  return messages
}

function mergeLocalReasoningFields(
  message: Message,
  previousMessage?: MessageWithLocalReasoning,
) {
  if (!previousMessage) {
    return message
  }

  return {
    ...message,
    localReasoningStartedAt:
      message.localReasoningStartedAt ?? previousMessage.localReasoningStartedAt,
    localReasoningCompletedAt:
      message.localReasoningCompletedAt ?? previousMessage.localReasoningCompletedAt,
  }
}
