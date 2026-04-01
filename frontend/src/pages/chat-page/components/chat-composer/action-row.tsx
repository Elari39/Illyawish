import {
  Maximize2,
  Minimize2,
  Paperclip,
  SendHorizonal,
  Square,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { useI18n } from '../../../../i18n/use-i18n'
import { cn } from '../../../../lib/utils'

interface ChatComposerActionRowProps {
  canSubmitComposer: boolean
  hasPendingUploads: boolean
  isExpanded: boolean
  isSending: boolean
  layoutMode: 'hero' | 'docked'
  leftContextBar?: ReactNode
  modelControl?: ReactNode
  showExpandToggle: boolean
  onOpenImagePicker: () => void
  onStopGeneration: () => void
  onToggleExpanded?: (expanded: boolean) => void
}

export function ChatComposerActionRow({
  canSubmitComposer,
  hasPendingUploads,
  isExpanded,
  isSending,
  layoutMode,
  leftContextBar,
  modelControl,
  showExpandToggle,
  onOpenImagePicker,
  onStopGeneration,
  onToggleExpanded,
}: ChatComposerActionRowProps) {
  const { t } = useI18n()
  const expandButtonLabel = isExpanded
    ? t('chat.collapseComposer')
    : t('chat.expandComposer')

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-[var(--line)] px-1 pt-1.5',
        layoutMode === 'hero' && 'pt-3',
        isExpanded && 'pt-4',
      )}
    >
      <div className="flex items-center gap-0.5">
        <button
          aria-label={t('chat.attachFile')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
          onClick={onOpenImagePicker}
          title={t('chat.attachFile')}
          type="button"
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
        {showExpandToggle ? (
          <button
            aria-expanded={isExpanded}
            aria-label={expandButtonLabel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--muted-foreground)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
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
        {isSending ? (
          <button
            aria-label={t('chat.stop')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--danger)] text-white transition hover:opacity-90 active:scale-[0.96]"
            onClick={onStopGeneration}
            title={t('chat.stop')}
            type="button"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            aria-label={t('chat.sendMessage')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white transition hover:bg-[var(--brand-strong)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmitComposer}
            title={t('chat.sendMessage')}
            type="submit"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
