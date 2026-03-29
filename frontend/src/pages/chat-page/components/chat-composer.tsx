import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  FileText,
  Maximize2,
  Minimize2,
  Paperclip,
  SendHorizonal,
  Square,
  X,
} from 'lucide-react'

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
  layoutMode?: 'hero' | 'docked'
  isExpanded?: boolean
  leftContextBar?: ReactNode
  modelControl?: ReactNode
  textareaMaxHeight?: number
  onToggleExpanded?: (expanded: boolean) => void
  onComposerChange: (value: string) => void
  onCancelEdit: () => void
  onStopGeneration: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onFilesSelected: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
}

const COMPACT_HERO_MIN_HEIGHT = 72
const COMPACT_DOCKED_MIN_HEIGHT = 64
const DEFAULT_TEXTAREA_MAX_HEIGHT = 216

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
  layoutMode = 'docked',
  isExpanded = false,
  leftContextBar,
  modelControl,
  textareaMaxHeight = DEFAULT_TEXTAREA_MAX_HEIGHT,
  onToggleExpanded,
  onComposerChange,
  onCancelEdit,
  onStopGeneration,
  onSubmit,
  onFilesSelected,
  onRemoveAttachment,
}: ChatComposerProps) {
  const { t } = useI18n()
  const [isDragActive, setIsDragActive] = useState(false)
  const [isComposerOverflowing, setIsComposerOverflowing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const compactMinHeight =
    layoutMode === 'hero' ? COMPACT_HERO_MIN_HEIGHT : COMPACT_DOCKED_MIN_HEIGHT
  const showExpandToggle = Boolean(onToggleExpanded) && (isExpanded || isComposerOverflowing)
  const expandButtonLabel = isExpanded
    ? t('chat.collapseComposer')
    : t('chat.expandComposer')

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      if (isExpanded) {
        textarea.style.height = '100%'
        textarea.style.overflowY = 'auto'
        setIsComposerOverflowing(Boolean(onToggleExpanded))
        return
      }

      textarea.style.height = '0px'
      const nextScrollHeight = textarea.scrollHeight
      const nextHeight = Math.max(
        compactMinHeight,
        Math.min(nextScrollHeight, textareaMaxHeight),
      )

      textarea.style.height = `${nextHeight}px`
      textarea.style.overflowY = nextScrollHeight > textareaMaxHeight ? 'auto' : 'hidden'
      setIsComposerOverflowing(nextScrollHeight > textareaMaxHeight)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    compactMinHeight,
    composerValue,
    isExpanded,
    onToggleExpanded,
    textareaMaxHeight,
  ])

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
    <footer
      className={cn(
        'bg-[var(--app-bg)] px-4 py-3 md:px-8 md:py-4',
        layoutMode === 'docked' && 'border-t border-[var(--line)]',
        layoutMode === 'hero' && 'w-full py-0',
        layoutMode === 'hero' && isExpanded && 'flex min-h-0 flex-1',
      )}
      data-expanded={isExpanded}
      data-layout={layoutMode}
      data-testid="chat-composer"
    >
      <div
        className={cn(
          'mx-auto space-y-3',
          layoutMode === 'hero' ? 'max-w-4xl' : 'max-w-3xl',
          isExpanded && 'flex h-full min-h-0 flex-col',
        )}
      >
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
            layoutMode === 'hero' && 'rounded-[28px] px-4 py-3 md:px-5 md:py-4',
            isExpanded &&
              'flex min-h-0 flex-col overflow-hidden rounded-[32px] px-4 py-4 md:px-6 md:py-5',
            layoutMode === 'docked' &&
              isExpanded &&
              'h-[min(68vh,720px)] min-h-[360px]',
            layoutMode === 'hero' && isExpanded && 'h-full flex-1',
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
          <div className={cn('relative', isExpanded && 'flex min-h-0 flex-1 flex-col')}>
            {showExpandToggle ? (
              <button
                aria-expanded={isExpanded}
                aria-label={expandButtonLabel}
                className="absolute right-0.5 top-0.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
                onClick={() => onToggleExpanded?.(!isExpanded)}
                title={expandButtonLabel}
                type="button"
              >
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            ) : null}

          <Textarea
            className={cn(
              'px-2 py-1.5 text-[15px]',
              isExpanded
                ? 'h-full min-h-0 flex-1 overflow-y-auto pr-12 text-base md:text-[17px]'
                : 'pr-10',
              !isExpanded && layoutMode === 'hero' && 'text-[15px] md:text-base',
            )}
            ref={textareaRef}
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
          </div>
          <div
            className={cn(
              'flex items-center justify-between gap-3 border-t border-[var(--line)] px-1 pt-1.5',
              layoutMode === 'hero' && 'pt-3',
              isExpanded && 'pt-4',
            )}
          >
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
              {leftContextBar}
            </div>

            <p className="hidden px-3 text-xs text-[var(--muted-foreground)] md:block">
              {hasPendingUploads ? t('common.loading') : t('chat.shortcutHint')}
            </p>

            <div className="flex items-center gap-2">
              {modelControl}
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
