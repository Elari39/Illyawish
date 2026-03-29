import { ChevronDown } from 'lucide-react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { localizeExecutionTemplateKey } from './execution-panel-labels'
import type { ExecutionPanelModel } from './execution-panel-model'
import {
  executionStatusBadgeClassName,
  executionStatusPanelClassName,
} from './execution-panel-status'
import {
  ExecutionStatusIcon,
} from './execution-panel-visuals'

interface ExecutionPanelCollapsedSummaryProps {
  model: ExecutionPanelModel
  onExpand: () => void
}

export function ExecutionPanelCollapsedSummary({
  model,
  onExpand,
}: ExecutionPanelCollapsedSummaryProps) {
  const { t } = useI18n()
  const templateLabel = model.run.templateKey
    ? localizeExecutionTemplateKey(t, model.run.templateKey)
    : t('executionPanel.none')

  return (
    <section
      className={cn(
        'rounded-2xl border px-3 py-2.5 transition-colors',
        executionStatusPanelClassName(model.run.status),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
          <ExecutionStatusIcon status={model.run.status} />
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{templateLabel}</p>
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              executionStatusBadgeClassName(model.run.status),
            )}
          >
            {t(`executionPanel.status.${model.run.status}`)}
          </span>
          <SummaryChip
            label={t('executionPanel.progressValue', {
              completed: model.collapsedSummary.completedStepCount,
              total: model.collapsedSummary.totalStepCount,
            })}
          />
          {model.collapsedSummary.hasRetrievalActivity ? (
            <SummaryChip
              label={t('executionPanel.retrievalCompact', {
                count: model.run.retrievalCount,
              })}
            />
          ) : null}
          {model.collapsedSummary.hasToolActivity ? (
            <SummaryChip
              label={t('executionPanel.toolCompact', {
                count: model.run.toolCount,
              })}
            />
          ) : null}
        </div>

        <Button className="px-2 py-1 text-xs" onClick={onExpand} type="button" variant="ghost">
          {t('executionPanel.showDetails')}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}

function SummaryChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--foreground)]">
      {label}
    </span>
  )
}
