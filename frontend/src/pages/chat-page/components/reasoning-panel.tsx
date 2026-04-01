import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import type { Message } from '../../../types/chat'
import {
  formatReasoningDuration,
  parseReasoningContent,
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

  const parsed = useMemo(
    () => parseReasoningContent(reasoningContent),
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

  // Determine current step for preview
  const currentStep = useMemo(() => {
    if (!reasoningContent.trim()) return 1
    // Count paragraphs that have content
    const content = reasoningContent.trim()
    const paragraphs = content.split(/\n\s*\n/)
    const filledParagraphs = paragraphs.filter((p) => p.trim().length > 0)
    return Math.min(filledParagraphs.length, parsed.totalSteps || 1)
  }, [reasoningContent, parsed.totalSteps])

  // Thinking phase label
  const phaseLabel = useMemo(() => {
    if (!isReasoningActive) {
      return durationLabel ? t('message.reasoning') : ''
    }
    if (isReasoningActive && parsed.totalSteps > 1) {
      return t('message.reasoning.reasoning')
    }
    return t('message.reasoning.analyzing')
  }, [isReasoningActive, parsed.totalSteps, durationLabel, t])

  // Determine border animation class
  const borderClass = useMemo(() => {
    if (!isReasoningActive) return ''
    return 'reasoning-border-flow'
  }, [isReasoningActive])

  return (
    <section
      className={`mt-3 overflow-hidden rounded-xl border bg-[color:color-mix(in_srgb,var(--surface-strong)_72%,transparent)] shadow-[0_18px_48px_rgba(15,23,42,0.06)] ${borderClass}`}
      aria-label={t('message.reasoning')}
    >
      {/* Main content row */}
      <div className="flex items-start gap-0">
        {/* Left progress accent bar */}
        <div
          className={`w-[3px] shrink-0 self-stretch rounded-l-xl ${isReasoningActive ? 'reasoning-progress-bar' : 'bg-[var(--brand)]'}`}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Top row: label + phase/status + duration */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                  {t('message.reasoning')}
                </div>

                {isReasoningActive && phaseLabel ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--hover-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
                    {phaseLabel}
                  </span>
                ) : null}

                {!isReasoningActive && durationLabel ? (
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                    {durationLabel}
                  </span>
                ) : null}
              </div>

              {/* Preview text when collapsed */}
              {!isExpanded && parsed.preview ? (
                <p className="mt-2 truncate text-[13px] leading-6 text-[var(--muted-foreground)]">
                  {parsed.preview}
                </p>
              ) : null}
            </div>

            <Button
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? t('message.collapseReasoning')
                  : t('message.expandReasoning')
              }
              className="h-9 w-9 shrink-0 rounded-full px-0"
              onClick={() => {
                setManualExpanded((currentValue) => !(currentValue ?? autoExpanded))
              }}
              variant="ghost"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 transition-transform duration-200" />
              ) : (
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expandable content - only rendered when expanded */}
      {isExpanded && (
        <div className="border-t border-[var(--line)] px-4 py-4">
          {/* Paragraph steps display */}
          {parsed.paragraphs.length > 1 ? (
            <div className="flex flex-col gap-3">
              {parsed.paragraphs.map((paragraph, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      i < currentStep - 1
                        ? 'bg-[var(--brand)]'
                        : i === currentStep - 1
                          ? 'bg-[var(--brand)] animate-pulse'
                          : 'bg-[var(--line)]'
                    }`}
                    aria-hidden="true"
                  />
                  <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--muted-foreground)]">
                    {paragraph}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--muted-foreground)]">
              {reasoningContent}
            </p>
          )}
        </div>
      )}

      {/* Inline styles for animations */}
      <style>{`
        @keyframes reasoning-progress {
          0% {
            background-position: 0% 0%;
            transform: scaleY(0.1);
          }
          50% {
            background-position: 100% 0%;
            transform: scaleY(0.7);
          }
          100% {
            background-position: 0% 0%;
            transform: scaleY(1);
          }
        }

        @keyframes reasoning-border-flow {
          0% {
            border-color: color-mix(in srgb, var(--brand) 30%, transparent);
            box-shadow: 0 0 8px color-mix(in srgb, var(--brand) 15%, transparent);
          }
          50% {
            border-color: color-mix(in srgb, var(--brand) 60%, transparent);
            box-shadow: 0 0 16px color-mix(in srgb, var(--brand) 25%, transparent);
          }
          100% {
            border-color: color-mix(in srgb, var(--brand) 30%, transparent);
            box-shadow: 0 0 8px color-mix(in srgb, var(--brand) 15%, transparent);
          }
        }

        .reasoning-progress-bar {
          background: linear-gradient(
            to bottom,
            var(--brand) 0%,
            color-mix(in srgb, var(--brand) 60%, transparent) 50%,
            var(--brand) 100%
          );
          background-size: 100% 200%;
          animation: reasoning-progress 2s ease-in-out infinite;
          transform-origin: top;
        }

        .reasoning-border-flow {
          border-width: 1px;
          border-style: solid;
          animation: reasoning-border-flow 2s ease-in-out infinite;
        }
      `}</style>
    </section>
  )
}
