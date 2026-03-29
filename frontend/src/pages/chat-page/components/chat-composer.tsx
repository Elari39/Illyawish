import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import { FileText, Paperclip, SendHorizonal, Square, X } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ComposerAttachment } from '../types'
import {
  ATTACHMENT_INPUT_ACCEPT,
  formatAttachmentSize,
  isImageAttachment,
} from '../utils'

interface ChatComposerProps {
  composerFormRef: RefObject<HTMLFormElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  hasPendingUploads: boolean
  canSubmitComposer: boolean
  isSending: boolean
  chatError: string | null
  composerIsComposingRef: MutableRefObject<boolean>
  contextBar?: ReactNode
  onComposerChange: (value: string) => void
  onCancelEdit: () => void
  onStopGeneration: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onFilesSelected: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
}

export function ChatComposer({
  composerFormRef,
  fileInputRef,
  composerValue,
  selectedAttachments,
  editingMessageId,
  hasPendingUploads,
  canSubmitComposer,
  isSending,
  chatError,
  composerIsComposingRef,
  contextBar,
  onComposerChange,
  onCancelEdit,
  onStopGeneration,
  onSubmit,
  onFilesSelected,
  onRemoveAttachment,
}: ChatComposerProps) {
  const { t } = useI18n()
  const [isDragActive, setIsDragActive] = useState(false)

  function handleOpenImagePicker() {
    fileInputRef.current?.click()
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }
    event.target.value = ''
    onFilesSelected(files)
  }

  function handleComposerKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== 'Enter') {
      return
    }

    if (event.ctrlKey) {
      return
    }

    if (composerIsComposingRef.current || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    if (!canSubmitComposer) {
      return
    }

    composerFormRef.current?.requestSubmit()
  }

  function handleDrop(files: File[]) {
    if (files.length === 0) {
      return
    }
    onFilesSelected(files)
  }

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 md:px-8 md:py-4">
      <div className="mx-auto max-w-3xl space-y-3">
        {editingMessageId ? (
          <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span>{t('chat.editingBanner')}</span>
            <Button onClick={onCancelEdit} variant="ghost">
              {t('common.cancel')}
            </Button>
          </div>
        ) : null}

        {selectedAttachments.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {selectedAttachments.map((attachment) => (
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
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                  disabled={attachment.isUploading}
                  onClick={() => onRemoveAttachment(attachment.id)}
                  type="button"
                  aria-label={t('chat.removeAttachment', { name: attachment.name })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className={cn(
            'rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2.5 shadow-[var(--shadow-md)] transition-colors md:px-4 md:py-3',
            isDragActive && 'border-[var(--brand)] bg-[var(--brand)]/[0.04]',
          )}
          ref={composerFormRef}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            const nextTarget = event.relatedTarget
            if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
              return
            }
            setIsDragActive(false)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!isDragActive) {
              setIsDragActive(true)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragActive(false)
            handleDrop(Array.from(event.dataTransfer.files))
          }}
          onSubmit={onSubmit}
        >
          <Textarea
            className="min-h-[72px] px-2 py-1.5 text-[15px] md:min-h-[84px]"
            onChange={(event) => onComposerChange(event.target.value)}
            onCompositionEnd={() => {
              composerIsComposingRef.current = false
            }}
            onCompositionStart={() => {
              composerIsComposingRef.current = true
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith('image/'),
              )
              if (files.length > 0) {
                onFilesSelected(files)
              }
            }}
            placeholder={
              editingMessageId
                ? t('chat.updateMessagePlaceholder')
                : t('chat.messagePlaceholder')
            }
            value={composerValue}
          />
          <div className="flex items-center justify-between border-t border-[var(--line)] px-1 pt-1.5">
            <div className="flex items-center gap-0.5">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
                onClick={handleOpenImagePicker}
                type="button"
                title={t('chat.attachFile')}
                aria-label={t('chat.attachFile')}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {contextBar}
            </div>

            <p className="px-3 text-xs text-[var(--muted-foreground)]">
              {hasPendingUploads ? t('common.loading') : t('chat.shortcutHint')}
            </p>

            {isSending ? (
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:opacity-90 active:scale-[0.96]"
                onClick={onStopGeneration}
                type="button"
                aria-label={t('chat.stop')}
                title={t('chat.stop')}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white transition hover:bg-[var(--brand-strong)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSubmitComposer}
                type="submit"
                aria-label={t('chat.sendMessage')}
                title={t('chat.sendMessage')}
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>

        <input
          accept={ATTACHMENT_INPUT_ACCEPT}
          className="hidden"
          multiple
          onChange={handleFileInputChange}
          ref={fileInputRef}
          type="file"
        />

        {chatError ? (
          <p className="px-1 text-sm text-[var(--danger)]">{chatError}</p>
        ) : null}
      </div>
    </footer>
  )
}
