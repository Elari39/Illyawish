import { useEffect, useRef, useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { MarkdownContent } from '../../../components/chat/markdown-content'
import { useI18n } from '../../../i18n/use-i18n'
import type { Message } from '../../../types/chat'
import {
  formatAttachmentSize,
  formatMessageTimestamp,
  isImageAttachment,
} from '../utils'

interface MessageBubbleProps {
  message: Message
  canEdit: boolean
  canRetry: boolean
  canRegenerate: boolean
  isEditing: boolean
  onCopySuccessToast: (message: string, variant?: 'success' | 'error' | 'info') => void
  onEdit: () => void
  onRetry: () => void
  onRegenerate: () => void
}

export function MessageBubble({
  message,
  canEdit,
  canRetry,
  canRegenerate,
  isEditing,
  onCopySuccessToast,
  onEdit,
  onRetry,
  onRegenerate,
}: MessageBubbleProps) {
  const { locale, t } = useI18n()
  const [copied, setCopied] = useState(false)
  const resetCopiedTimerRef = useRef<number | null>(null)
  const isUser = message.role === 'user'
  const isFailed = message.status === 'failed'
  const isCancelled = message.status === 'cancelled'
  const imageAttachments = message.attachments.filter((attachment) =>
    isImageAttachment(attachment),
  )
  const documentAttachments = message.attachments.filter(
    (attachment) => !isImageAttachment(attachment),
  )

  useEffect(() => {
    return () => {
      if (resetCopiedTimerRef.current) {
        window.clearTimeout(resetCopiedTimerRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      onCopySuccessToast(t('message.copied'), 'success')
      if (resetCopiedTimerRef.current) {
        window.clearTimeout(resetCopiedTimerRef.current)
      }
      resetCopiedTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetCopiedTimerRef.current = null
      }, 1200)
    } catch {
      onCopySuccessToast(t('error.copyMessage'), 'error')
    }
  }

  if (isUser) {
    return (
      <article className="chat-fade-in flex justify-end">
        <div className="max-w-[85%] space-y-2 md:max-w-[560px]">
          <div className="rounded-2xl bg-[var(--user-bubble)] px-4 py-3 text-[var(--user-bubble-foreground)]">
            {imageAttachments.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-3">
                {imageAttachments.map((attachment) => (
                  <img
                    key={attachment.id}
                    alt={attachment.name}
                    className="w-full rounded-xl border border-[var(--line-strong)] object-cover"
                    src={attachment.url}
                  />
                ))}
              </div>
            ) : null}
            {documentAttachments.length > 0 ? (
              <div className="mb-3 space-y-2">
                {documentAttachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-left text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
                    href={attachment.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {attachment.name}
                      </span>
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {attachment.mimeType} · {formatAttachmentSize(attachment.size)}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-[15px] leading-7">{message.content}</p>
          </div>
          <div className="flex items-center justify-end gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{formatMessageTimestamp(message.createdAt, locale)}</span>
            {isEditing ? <span>{t('message.editing')}</span> : null}
            <Button
              className="px-2 py-1 text-xs"
              onClick={() => void handleCopy()}
              variant="ghost"
            >
              {copied ? t('message.copied') : t('message.copy')}
            </Button>
            {canEdit ? (
              <Button className="px-2 py-1 text-xs" onClick={onEdit} variant="ghost">
                {t('message.edit')}
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="chat-fade-in">
      <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <span>{formatMessageTimestamp(message.createdAt, locale)}</span>
        {isFailed ? <span className="text-[var(--danger)]">{t('message.failed')}</span> : null}
        {isCancelled ? <span className="text-[var(--danger)]">{t('message.stopped')}</span> : null}
      </div>
      <MarkdownContent content={message.content} />

      {canRetry || canRegenerate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="rounded-full px-3 py-1.5 text-xs"
            onClick={() => void handleCopy()}
            variant="secondary"
          >
            {copied ? t('message.copied') : t('message.copy')}
          </Button>
          {canRetry ? (
            <Button
              className="rounded-full px-3 py-1.5 text-xs"
              onClick={onRetry}
              variant="secondary"
            >
              {t('message.retry')}
            </Button>
          ) : null}
          {canRegenerate ? (
            <Button
              className="rounded-full px-3 py-1.5 text-xs"
              onClick={onRegenerate}
              variant="secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('chat.regenerate')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="rounded-full px-3 py-1.5 text-xs"
            onClick={() => void handleCopy()}
            variant="secondary"
          >
            {copied ? t('message.copied') : t('message.copy')}
          </Button>
        </div>
      )}
    </article>
  )
}
