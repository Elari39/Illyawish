import type { Attachment, Message } from '../../types/chat'

interface StreamingMessageTarget {
  conversationId: number
  placeholderId: number
  messageId: number | null
}

export function appendToStreamingMessage(
  messages: Message[],
  target: StreamingMessageTarget,
  content: string,
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
        content: candidate.content + content,
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
      return message
    }
    return item
  })

  return replaced ? nextMessages : [...nextMessages, message]
}

export function isSameMessage(
  message: Message,
  target: StreamingMessageTarget,
) {
  if (message.conversationId !== target.conversationId) {
    return false
  }

  return message.id === target.placeholderId ||
    (target.messageId != null && message.id === target.messageId)
}

export function dedupeMessages(messages: Message[]) {
  const uniqueById = new Map<number, Message>()
  for (const message of messages) {
    uniqueById.set(message.id, message)
  }

  return Array.from(uniqueById.values()).sort((left, right) => left.id - right.id)
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

export function isImageAttachment(attachment: Pick<Attachment, 'mimeType'>) {
  return attachment.mimeType.startsWith('image/')
}

export function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${size} B`
}

export function formatMessageTimestamp(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
