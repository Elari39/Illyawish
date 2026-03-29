import { Gauge, Sparkles } from 'lucide-react'

import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import {
  localizeExecutionStepName,
  localizeExecutionTemplateKey,
} from './execution-panel-labels'
import type { ExecutionPanelModel } from './execution-panel-model'
import { executionStatusBadgeClassName } from './execution-panel-status'
import {
  ExecutionStatusIcon,
} from './execution-panel-visuals'

interface ExecutionPanelHeaderProps {
  model: ExecutionPanelModel
}

export function ExecutionPanelHeader({ model }: ExecutionPanelHeaderProps) {
  const { t } = useI18n()
  const templateLabel = model.run.templateKey
    ? localizeExecutionTemplateKey(t, model.run.templateKey)
    : t('executionPanel.none')
  const currentStageLabel = model.activeStage
    ? localizeExecutionStepName(t, model.activeStage)
    : t('executionPanel.none')

  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
      <div className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface-strong)]/90 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] text-[var(--foreground)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              {t('executionPanel.executionProgress')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold text-[var(--foreground)]">{templateLabel}</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  executionStatusBadgeClassName(model.run.status),
                )}
              >
                <ExecutionStatusIcon className="h-3.5 w-3.5" status={model.run.status} />
                {t(`executionPanel.status.${model.run.status}`)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {t('executionPanel.currentStage')}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{currentStageLabel}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--app-bg)]/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {t('executionPanel.summary.progress')}
              </p>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {model.progressPercent}%
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[var(--line)]/70">
              <div
                className={cn(
                  'h-full rounded-full bg-[var(--brand)] transition-[width]',
                  model.run.status === 'running' ? 'animate-pulse' : '',
                )}
                style={{ width: `${Math.max(model.progressPercent, 6)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              {t('executionPanel.progressValue', {
                completed: model.run.completedStepCount,
                total: model.run.totalStepCount,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--app-bg)]/70 p-4">
        <div className="flex items-center gap-2 text-[var(--foreground)]">
          <Gauge className="h-4 w-4" />
          <p className="text-sm font-semibold">{t('executionPanel.summaryTitle')}</p>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <SummaryMetric
            label={t('executionPanel.stepsTitle')}
            value={String(model.run.totalStepCount)}
          />
          <SummaryMetric
            label={t('executionPanel.retrievalTitle')}
            value={String(model.run.retrievalCount)}
          />
          <SummaryMetric
            label={t('executionPanel.toolsTitle')}
            value={String(model.run.toolCount)}
          />
        </dl>
      </div>
    </header>
  )
}

function SummaryMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-3">
      <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-2 text-lg font-semibold text-[var(--foreground)]">{value}</dd>
    </div>
  )
}
