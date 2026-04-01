import type { Attachment, Message } from '../../types/chat'

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

export function getDisplayMessageParts(
  message: Pick<Message, 'role' | 'content' | 'reasoningContent'>,
) {
  if (message.role !== 'assistant') {
    return {
      reasoningContent: '',
      content: message.content,
    }
  }

  if (message.reasoningContent) {
    return {
      reasoningContent: message.reasoningContent,
      content: message.content,
    }
  }

  return splitLeadingThinkBlock(message.content)
}

export function getMessageCopyText(
  message: Pick<Message, 'role' | 'content' | 'reasoningContent'>,
) {
  const parts = getDisplayMessageParts(message)
  if (!parts.reasoningContent) {
    return parts.content
  }

  if (!parts.content) {
    return parts.reasoningContent
  }

  return `${parts.reasoningContent}\n\n${parts.content}`
}

export function getReasoningPreview(reasoningContent: string, maxLines = 2) {
  const normalizedContent = reasoningContent.trim()
  if (!normalizedContent) {
    return ''
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= maxLines) {
    return lines.join('\n')
  }

  return `${lines.slice(0, maxLines).join('\n')}…`
}

export interface ParsedReasoning {
  paragraphs: string[]
  preview: string
  totalSteps: number
}

/**
 * Parse reasoning content into paragraphs by splitting on single newlines.
 * Each non-empty line becomes a step. Used for structured step display.
 */
export function parseReasoningContent(content: string): ParsedReasoning {
  const trimmed = content.trim()
  if (!trimmed) {
    return { paragraphs: [], preview: '', totalSteps: 0 }
  }

  // Split by single newlines, filter empty lines
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      paragraphs: [trimmed],
      preview: trimmed.slice(0, 100),
      totalSteps: 1,
    }
  }

  // Build preview: first line + second line (like original getReasoningPreview)
  const preview =
    lines.length === 1
      ? lines[0].slice(0, 100)
      : `${lines[0]}\n${lines[1]}…`

  return {
    paragraphs: lines,
    preview,
    totalSteps: lines.length,
  }
}

export function formatReasoningDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
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

function splitLeadingThinkBlock(content: string) {
  if (!content) {
    return {
      reasoningContent: '',
      content: '',
    }
  }

  let index = 0
  let reasoningContent = ''
  let consumedLeadingThink = false

  while (index < content.length) {
    const whitespaceStart = index
    while (index < content.length && isThinkWhitespace(content[index])) {
      index += 1
    }

    if (content.startsWith('<think>', index)) {
      consumedLeadingThink = true
      index += '<think>'.length
      const closeIndex = content.indexOf('</think>', index)
      if (closeIndex === -1) {
        return {
          reasoningContent: reasoningContent + content.slice(index),
          content: '',
        }
      }

      reasoningContent += content.slice(index, closeIndex)
      index = closeIndex + '</think>'.length
      continue
    }

    if (consumedLeadingThink) {
      return {
        reasoningContent,
        content: content.slice(whitespaceStart),
      }
    }

    return {
      reasoningContent: '',
      content,
    }
  }

  return {
    reasoningContent,
    content: '',
  }
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

function isThinkWhitespace(value: string | undefined) {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t'
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
