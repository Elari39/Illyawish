import { Button } from '../../../components/ui/button'
import { MarkdownContent } from '../../../components/chat/markdown-content'
import { useI18n } from '../../../i18n/use-i18n'
import type { Message } from '../../../types/chat'
import { formatMessageTimestamp } from '../utils'

interface MessageBubbleProps {
  message: Message
  canEdit: boolean
  canRetry: boolean
  canRegenerate: boolean
  isEditing: boolean
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
  onEdit,
  onRetry,
  onRegenerate,
}: MessageBubbleProps) {
  const { locale, t } = useI18n()
  const isUser = message.role === 'user'
  const isFailed = message.status === 'failed'
  const isCancelled = message.status === 'cancelled'

  if (isUser) {
    return (
      <article className="chat-fade-in flex justify-end">
        <div className="max-w-[85%] space-y-2 md:max-w-[560px]">
          <div className="rounded-2xl bg-[var(--user-bubble)] px-4 py-3 text-[var(--user-bubble-foreground)]">
            {message.attachments.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-3">
                {message.attachments.map((attachment) => (
                  <img
                    key={attachment.id}
                    alt={attachment.name}
                    className="w-full rounded-xl border border-black/10 object-cover"
                    src={attachment.url}
                  />
                ))}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-[15px] leading-7">{message.content}</p>
          </div>
          <div className="flex items-center justify-end gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{formatMessageTimestamp(message.createdAt, locale)}</span>
            {isEditing ? <span>{t('message.editing')}</span> : null}
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
          {canRetry ? (
            <Button className="px-3 py-2" onClick={onRetry} variant="secondary">
              {t('message.retry')}
            </Button>
          ) : null}
          {canRegenerate ? (
            <Button className="px-3 py-2" onClick={onRegenerate} variant="secondary">
              {t('chat.regenerate')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
