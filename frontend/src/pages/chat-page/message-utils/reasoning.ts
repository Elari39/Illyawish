import type { Message } from '../../../types/chat'

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
  return joinReasoningAndContentForCopy(parts.reasoningContent, parts.content)
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

export function parseReasoningContent(content: string): ParsedReasoning {
  const trimmed = content.trim()
  if (!trimmed) {
    return { paragraphs: [], preview: '', totalSteps: 0 }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      paragraphs: [trimmed],
      preview: getReasoningPreview(trimmed),
      totalSteps: 1,
    }
  }

  return {
    paragraphs: lines,
    preview: getReasoningPreview(lines.join('\n')),
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

export function joinReasoningAndContentForCopy(
  reasoningContent: string,
  content: string,
) {
  if (!reasoningContent) {
    return content
  }

  const normalizedContent = content.replace(/^(?:[ \t]*\r?\n)+/, '')
  if (!normalizedContent) {
    return reasoningContent
  }

  return `${reasoningContent}\n\n${normalizedContent}`
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
      if (consumedLeadingThink && whitespaceStart < index) {
        reasoningContent += content.slice(whitespaceStart, index)
      }
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

function isThinkWhitespace(value: string | undefined) {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t'
}
