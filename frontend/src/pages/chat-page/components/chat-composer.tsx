import {
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
  AlertCircle,
  X,
} from 'lucide-react'

import { Textarea } from '../../../components/ui/textarea'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import type { ChatErrorState, ComposerAttachment } from '../types'
import { ATTACHMENT_INPUT_ACCEPT } from '../utils'
import { ChatComposerActionRow } from './chat-composer/action-row'
import { AttachmentStrip } from './chat-composer/attachment-strip'
import { EditingBanner } from './chat-composer/editing-banner'
import { useTextareaSizing } from './chat-composer/use-textarea-sizing'

interface ChatComposerProps {
  composerFormRef: RefObject<HTMLFormElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  composerValue: string
  selectedAttachments: ComposerAttachment[]
  editingMessageId: number | null
  hasPendingUploads: boolean
  canSubmitComposer: boolean
  isSending: boolean
  chatError: ChatErrorState | null
  composerIsComposingRef: MutableRefObject<boolean>
  layoutMode?: 'hero' | 'docked'
  isExpanded?: boolean
  leftContextBar?: ReactNode
  modelControl?: ReactNode
  textareaMaxHeight?: number
  onToggleExpanded?: (expanded: boolean) => void
  onComposerChange: (value: string) => void
  onCancelEdit: () => void
  onDismissChatError?: () => void
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
  onDismissChatError,
  onStopGeneration,
  onSubmit,
  onFilesSelected,
  onRemoveAttachment,
}: ChatComposerProps) {
  const { t } = useI18n()
  const [isDragActive, setIsDragActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const compactMinHeight =
    layoutMode === 'hero' ? COMPACT_HERO_MIN_HEIGHT : COMPACT_DOCKED_MIN_HEIGHT
  const { isComposerOverflowing } = useTextareaSizing({
    textareaRef,
    composerValue,
    compactMinHeight,
    isExpanded,
    textareaMaxHeight,
    onToggleExpanded,
  })
  const showExpandToggle = Boolean(onToggleExpanded) && (isExpanded || isComposerOverflowing)

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
          <EditingBanner onCancelEdit={onCancelEdit} />
        ) : null}

        <AttachmentStrip
          attachments={selectedAttachments}
          onRemoveAttachment={onRemoveAttachment}
        />

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
          <ChatComposerActionRow
            canSubmitComposer={canSubmitComposer}
            hasPendingUploads={hasPendingUploads}
            isExpanded={isExpanded}
            isSending={isSending}
            layoutMode={layoutMode}
            leftContextBar={leftContextBar}
            modelControl={modelControl}
            showExpandToggle={showExpandToggle}
            onOpenImagePicker={handleOpenImagePicker}
            onStopGeneration={onStopGeneration}
            onToggleExpanded={onToggleExpanded}
          />
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
          <div className="px-1">
            <div
              className="flex items-start justify-between gap-4 rounded-[1.25rem] border border-[color-mix(in_srgb,var(--danger)_55%,var(--line)_45%)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--danger)_16%,var(--surface)_84%),color-mix(in_srgb,var(--danger)_10%,var(--surface)_90%))] px-4 py-3.5 text-[var(--foreground)] shadow-[0_18px_44px_rgba(120,26,26,0.18)]"
              role="alert"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--danger)_28%,var(--line)_72%)] bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold leading-5 text-[var(--danger)]">
                    {t('common.error')}
                  </p>
                  <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-[color-mix(in_srgb,var(--foreground)_92%,var(--danger)_8%)]">
                    {chatError.message}
                  </p>
                </div>
              </div>
              <button
                aria-label={t('common.close')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--danger)_24%,var(--line)_76%)] bg-[color-mix(in_srgb,var(--surface)_82%,var(--danger)_18%)] text-[var(--danger)] transition hover:bg-[color-mix(in_srgb,var(--surface)_68%,var(--danger)_32%)]"
                onClick={onDismissChatError}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </footer>
  )
}
