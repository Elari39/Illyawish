import type { I18nContextValue } from '../../i18n/context'
import { formatDateTime } from '../../lib/utils'
import type { Conversation, ImportConversationPayload, Message } from '../../types/chat'
import { isImageAttachment } from './message-utils'

export function buildConversationMarkdown(
  conversation: Conversation,
  messages: Message[],
  locale: string,
  t: I18nContextValue['t'],
) {
  const lines = [
    `# ${conversation.title}`,
    '',
    `${t('markdown.model')}: ${conversation.settings.model || t('chat.defaultModel')}`,
    `${t('markdown.updated')}: ${formatDateTime(conversation.updatedAt, locale)}`,
    '',
  ]

  for (const message of messages) {
    lines.push(
      `## ${message.role === 'user' ? t('markdown.user') : t('markdown.assistant')}`,
    )
    lines.push('')

    if (message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        lines.push(
          isImageAttachment(attachment)
            ? `![${attachment.name}](${attachment.url})`
            : `[${attachment.name}](${attachment.url})`,
        )
      }
      lines.push('')
    }

    if (message.content) {
      lines.push(message.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function buildConversationExportFilename(
  title: string | null | undefined,
  fallbackTitle: string,
) {
  const cleanedTitle = cleanConversationFileBaseName(title)
  const cleanedFallback = cleanConversationFileBaseName(fallbackTitle)
  const baseName = cleanedTitle || cleanedFallback || 'conversation'

  if (/\.md$/i.test(baseName)) {
    return baseName
  }

  return `${baseName}.md`
}

export function parseConversationMarkdownImport(
  content: string,
  filename: string,
  fallbackTitle: string,
): ImportConversationPayload {
  const normalizedContent = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = normalizedContent.split('\n')
  const messages: ImportConversationPayload['messages'] = []
  let title = ''
  let model = ''
  let activeRole: ImportConversationPayload['messages'][number]['role'] | null = null
  let activeLines: string[] = []

  for (const line of lines) {
    if (!title) {
      const titleMatch = line.match(/^#\s+(.+?)\s*$/)
      if (titleMatch) {
        title = titleMatch[1] ?? ''
        continue
      }
    }

    const headingMatch = line.match(/^##\s+(.+?)\s*$/)
    if (headingMatch) {
      const nextRole = resolveImportedMessageRole(headingMatch[1] ?? '')
      if (nextRole) {
        flushImportedMessage(messages, activeRole, activeLines)
        activeRole = nextRole
        activeLines = []
        continue
      }
    }

    if (!activeRole) {
      const modelMatch = line.match(/^(Model|模型|モデル):\s*(.+?)\s*$/)
      if (modelMatch) {
        model = modelMatch[2] ?? ''
      }
      continue
    }

    activeLines.push(line)
  }

  flushImportedMessage(messages, activeRole, activeLines)

  if (messages.length === 0) {
    throw new Error('No importable messages were found in the selected Markdown file.')
  }

  const resolvedTitle =
    cleanConversationFileBaseName(title) ||
    cleanConversationFileBaseName(stripConversationImportExtension(filename)) ||
    cleanConversationFileBaseName(fallbackTitle) ||
    'conversation'

  return {
    title: resolvedTitle,
    settings: model.trim() ? { model: model.trim() } : undefined,
    messages,
  }
}

function cleanConversationFileBaseName(value: string | null | undefined) {
  return stripControlCharacters(value ?? '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(\.md)$/i, '$1')
    .replace(/^[.\s]+|[.\s]+$/g, '')
}

function stripControlCharacters(value: string) {
  let result = ''

  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (
      codePoint != null &&
      ((codePoint >= 0x00 && codePoint <= 0x1f) || codePoint === 0x7f)
    ) {
      continue
    }
    result += character
  }

  return result
}

function resolveImportedMessageRole(value: string) {
  const label = value.trim()
  if (label === 'User' || label === '用户' || label === 'ユーザー') {
    return 'user'
  }
  if (label === 'Assistant' || label === '助手' || label === 'アシスタント') {
    return 'assistant'
  }
  return null
}

function flushImportedMessage(
  messages: ImportConversationPayload['messages'],
  role: ImportConversationPayload['messages'][number]['role'] | null,
  lines: string[],
) {
  if (!role) {
    return
  }

  const content = trimSectionBlankLines(lines.join('\n'))
  if (!content) {
    return
  }

  messages.push({
    role,
    content,
  })
}

function trimSectionBlankLines(value: string) {
  const lines = value.split('\n')

  while (lines.length > 0 && lines[0]?.trim() === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop()
  }

  return lines.join('\n')
}

function stripConversationImportExtension(filename: string) {
  return filename.replace(/\.(md|markdown|txt)$/i, '')
}
