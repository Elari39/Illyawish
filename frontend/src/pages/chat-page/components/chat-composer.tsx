import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { Paperclip, SendHorizonal, X } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ComposerImage } from '../types'

interface ChatComposerProps {
  composerFormRef: RefObject<HTMLFormElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  composerValue: string
  selectedImages: ComposerImage[]
  editingMessageId: number | null
  hasPendingUploads: boolean
  canSubmitComposer: boolean
  chatError: string | null
  composerIsComposingRef: MutableRefObject<boolean>
  onComposerChange: (value: string) => void
  onCancelEdit: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onFilesSelected: (files: File[]) => void
  onRemoveImage: (id: string) => void
}

export function ChatComposer({
  composerFormRef,
  fileInputRef,
  composerValue,
  selectedImages,
  editingMessageId,
  hasPendingUploads,
  canSubmitComposer,
  chatError,
  composerIsComposingRef,
  onComposerChange,
  onCancelEdit,
  onSubmit,
  onFilesSelected,
  onRemoveImage,
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
    <footer className="border-t border-[var(--line)] bg-[var(--app-bg)] px-4 py-4 md:px-8 md:py-5">
      <div className="mx-auto max-w-3xl space-y-3">
        {editingMessageId ? (
          <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted-foreground)]">
            <span>{t('chat.editingBanner')}</span>
            <Button onClick={onCancelEdit} variant="ghost">
              {t('common.cancel')}
            </Button>
          </div>
        ) : null}

        {selectedImages.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {selectedImages.map((image) => (
              <div
                key={image.id}
                className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-white p-1"
              >
                <img
                  alt={image.name}
                  className="h-20 w-20 rounded-lg object-cover"
                  src={image.previewUrl}
                />
                {image.isUploading ? (
                  <div className="absolute inset-x-1 bottom-1 rounded-lg bg-black/70 px-2 py-1 text-center text-[11px] text-white">
                    {t('common.loading')}
                  </div>
                ) : null}
                <button
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                  disabled={image.isUploading}
                  onClick={() => onRemoveImage(image.id)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form
          className={cn(
            'rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[var(--shadow-md)] transition-colors',
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
            className="min-h-[96px] p-2 text-[15px]"
            onChange={(event) => onComposerChange(event.target.value)}
            onCompositionEnd={() => {
              composerIsComposingRef.current = false
            }}
            onCompositionStart={() => {
              composerIsComposingRef.current = true
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
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
          <div className="flex items-center justify-between border-t border-[var(--line)] px-1 pt-2">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
              onClick={handleOpenImagePicker}
              type="button"
              title={t('chat.attachImage')}
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <p className="px-3 text-xs text-[var(--muted-foreground)]">
              {hasPendingUploads ? t('common.loading') : t('chat.shortcutHint')}
            </p>

            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white transition hover:bg-[var(--brand-strong)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmitComposer}
              type="submit"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </form>

        <input
          accept="image/*"
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
