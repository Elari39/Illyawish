import { FileText, X } from 'lucide-react'

import { useI18n } from '../../../../i18n/use-i18n'
import { cn } from '../../../../lib/utils'
import type { ComposerAttachment } from '../../types'
import { formatAttachmentSize, isImageAttachment } from '../../utils'

interface AttachmentStripProps {
  attachments: ComposerAttachment[]
  onRemoveAttachment: (id: string) => void
}

export function AttachmentStrip({
  attachments,
  onRemoveAttachment,
}: AttachmentStripProps) {
  const { t } = useI18n()

  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={cn(
            'relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-strong)]',
            isImageAttachment(attachment)
              ? 'p-1'
              : 'flex w-full max-w-xs items-center gap-3 px-4 py-3',
          )}
        >
          {isImageAttachment(attachment) && attachment.previewUrl ? (
            <img
              alt={attachment.name}
              className="h-20 w-20 rounded-lg object-cover"
              src={attachment.previewUrl}
            />
          ) : (
            <>
              <div className="rounded-lg bg-[var(--sidebar-bg)] p-2 text-[var(--muted-foreground)]">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 pr-6">
                <p className="truncate text-sm font-medium text-[var(--foreground)]">
                  {attachment.name}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {attachment.mimeType || 'application/octet-stream'} ·{' '}
                  {formatAttachmentSize(attachment.size)}
                </p>
              </div>
            </>
          )}
          {attachment.isUploading ? (
            <div className="absolute inset-x-1 bottom-1 rounded-lg bg-black/70 px-2 py-1 text-center text-[11px] text-white">
              {t('common.loading')}
            </div>
          ) : null}
          <button
            aria-label={t('chat.removeAttachment', { name: attachment.name })}
            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
            disabled={attachment.isUploading}
            onClick={() => onRemoveAttachment(attachment.id)}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
