import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { localizeExecutionEventLabel } from './execution-panel-labels'
import type { ExecutionTimelineItem } from './execution-panel-model'
import {
  executionStatusBadgeClassName,
  executionStatusDotClassName,
} from './execution-panel-status'

interface ExecutionPanelTimelineProps {
  isOpen: boolean
  items: ExecutionTimelineItem[]
  onToggle: () => void
}

export function ExecutionPanelTimeline({
  isOpen,
  items,
  onToggle,
}: ExecutionPanelTimelineProps) {
  const { t } = useI18n()

  if (items.length === 0) {
    return null
  }

  return (
    <section className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--app-bg)]/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{t('executionPanel.timelineTitle')}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t('executionPanel.timelineDescription')}</p>
        </div>
        <Button onClick={onToggle} type="button" variant="ghost">
          {isOpen ? t('executionPanel.hideTimeline') : t('executionPanel.showTimeline')}
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {isOpen ? (
        <div className="mt-4 grid gap-3">
          {items.map((item, index) => (
            <div className="flex gap-3" key={`${item.type}-${index}`}>
              <div className="flex flex-col items-center">
                <span className={cn('mt-1 h-2.5 w-2.5 rounded-full', executionStatusDotClassName(item.status))} />
                {index < items.length - 1 ? (
                  <span className="mt-1 h-full w-px bg-[var(--line)]" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 rounded-2xl border border-white/70 bg-white/85 px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {localizeExecutionEventLabel(t, item.type)}
                  </p>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      executionStatusBadgeClassName(item.status),
                    )}
                  >
                    {t(`executionPanel.status.${item.status}`)}
                  </span>
                </div>
                {item.description ? (
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.description}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
