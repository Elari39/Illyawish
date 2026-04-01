import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { Message } from '../../../types/chat'
import {
  formatReasoningDuration,
  getReasoningPreview,
} from '../utils'

interface ReasoningPanelProps {
  reasoningContent: string
  status: Message['status']
  reasoningStartedAt?: number
  reasoningCompletedAt?: number
}

export function ReasoningPanel({
  reasoningContent,
  status,
  reasoningStartedAt,
  reasoningCompletedAt,
}: ReasoningPanelProps) {
  const { t } = useI18n()
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)
  const preview = useMemo(
    () => getReasoningPreview(reasoningContent),
    [reasoningContent],
  )
  const durationLabel = useMemo(() => {
    if (
      reasoningStartedAt == null ||
      reasoningCompletedAt == null ||
      reasoningCompletedAt <= reasoningStartedAt
    ) {
      return ''
    }

    return formatReasoningDuration(reasoningCompletedAt - reasoningStartedAt)
  }, [reasoningCompletedAt, reasoningStartedAt])
  const isReasoningActive =
    status === 'streaming' && reasoningCompletedAt == null
  const autoExpanded =
    isReasoningActive || status === 'failed' || status === 'cancelled'
  const isExpanded = manualExpanded ?? autoExpanded

  return (
    <section className="mt-3 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[color:color-mix(in_srgb,var(--surface-strong)_72%,transparent)] shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              {t('message.reasoning')}
            </div>
            {isReasoningActive ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--hover-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
                {t('message.thinking')}
              </span>
            ) : null}
            {!isReasoningActive && durationLabel ? (
              <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                {durationLabel}
              </span>
            ) : null}
          </div>
          {!isExpanded && preview ? (
            <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-6 text-[var(--muted-foreground)]">
              {preview}
            </p>
          ) : null}
        </div>
        <Button
          aria-expanded={isExpanded}
          aria-label={
            isExpanded ? t('message.collapseReasoning') : t('message.expandReasoning')
          }
          className="h-9 w-9 shrink-0 rounded-full px-0"
          onClick={() => {
            setManualExpanded((currentValue) => !(currentValue ?? autoExpanded))
          }}
          variant="ghost"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>
      {isExpanded ? (
        <div className="border-t border-[var(--line)] px-4 py-4">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--muted-foreground)]">
            {reasoningContent}
          </p>
        </div>
      ) : null}
    </section>
  )
}
