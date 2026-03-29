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
        'mb-4 rounded-[1.5rem] border px-4 py-3 shadow-sm transition-colors',
        executionStatusPanelClassName(model.run.status),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {t('executionPanel.collapsedSummary', {
              completed: model.collapsedSummary.completedStepCount,
              total: model.collapsedSummary.totalStepCount,
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {model.collapsedSummary.hasRetrievalActivity ? (
              <SummaryChip label={t('executionPanel.retrievalTitle')} />
            ) : null}
            {model.collapsedSummary.hasToolActivity ? (
              <SummaryChip label={t('executionPanel.toolsTitle')} />
            ) : null}
          </div>
        </div>

        <Button onClick={onExpand} type="button" variant="ghost">
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
