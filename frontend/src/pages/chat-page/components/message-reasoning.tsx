import { BrainCircuit, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'

interface MessageReasoningProps {
  reasoningContent: string
  isStreaming: boolean
}

export function MessageReasoning({
  reasoningContent,
  isStreaming,
}: MessageReasoningProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(isStreaming)

  if (!reasoningContent) {
    return null
  }

  return (
    <section className="mt-3 rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)]/75 px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <BrainCircuit className="h-4 w-4" />
            <p className="text-sm font-medium">{t('message.reasoning')}</p>
          </div>
          {!expanded ? (
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              {t('message.reasoningCollapsedHint')}
            </p>
          ) : null}
        </div>

        <Button
          aria-label={expanded ? t('message.collapseReasoning') : t('message.expandReasoning')}
          className="px-2 py-1 text-xs"
          onClick={() => setExpanded((previous) => !previous)}
          type="button"
          variant="ghost"
        >
          {expanded ? t('message.collapseReasoning') : t('message.expandReasoning')}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {expanded ? (
        <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-3 py-3 text-sm leading-6 text-[var(--foreground)]">
          {reasoningContent}
        </p>
      ) : null}
    </section>
  )
}
