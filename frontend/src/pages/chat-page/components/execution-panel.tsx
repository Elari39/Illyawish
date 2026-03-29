import { ChevronUp, GitBranch } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { ExecutionPanelCollapsedSummary } from './execution-panel-collapsed-summary'
import {
  localizeExecutionStepName,
  localizeExecutionTemplateKey,
} from './execution-panel-labels'
import type { ExecutionPanelModel, ExecutionStepSummary } from './execution-panel-model'
import { ExecutionPanelRetrievalCard } from './execution-panel-retrieval-card'
import { executionStatusBadgeClassName, executionStatusPanelClassName } from './execution-panel-status'
import { ExecutionPanelTimeline } from './execution-panel-timeline'
import { ExecutionPanelToolCard } from './execution-panel-tool-card'
import { ExecutionStatusIcon } from './execution-panel-visuals'

interface ExecutionPanelProps {
  model: ExecutionPanelModel | null
  onConfirmToolCall: (approved: boolean) => Promise<void>
}

export function ExecutionPanel({
  model,
  onConfirmToolCall,
}: ExecutionPanelProps) {
  const { t } = useI18n()
  const [panelState, setPanelState] = useState<{
    timelineOpen: boolean
    expanded: boolean
    signature: string
  }>({
    timelineOpen: false,
    expanded: true,
    signature: '',
  })

  if (!model) {
    return null
  }

  const panelSignature = [
    model.run.templateKey,
    model.run.status,
    model.run.completedStepCount,
    model.run.totalStepCount,
    model.timeline.length,
    model.latestRetrieval?.citationCount ?? 0,
    model.latestTool?.toolName ?? '',
  ].join(':')
  const defaultExpanded = model.displayState !== 'collapsed'
  const currentState =
    panelState.signature === panelSignature
      ? panelState
      : {
          timelineOpen: false,
          expanded: defaultExpanded,
          signature: panelSignature,
        }

  if (!currentState.expanded) {
    return (
      <ExecutionPanelCollapsedSummary
        model={model}
        onExpand={() =>
          setPanelState({
            timelineOpen: false,
            expanded: true,
            signature: panelSignature,
          })
        }
      />
    )
  }

  const templateLabel = model.run.templateKey
    ? localizeExecutionTemplateKey(t, model.run.templateKey)
    : t('executionPanel.none')

  return (
    <section
      className={cn(
        'rounded-[1.35rem] border px-3 py-3 shadow-sm transition-colors',
        executionStatusPanelClassName(model.run.status),
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[var(--foreground)]">
              <GitBranch className="h-4 w-4" />
              <p className="text-sm font-medium text-[var(--muted-foreground)]">
                {t('executionPanel.summary.template')}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-[var(--foreground)]">{templateLabel}</p>
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

          <div className="flex items-center gap-2">
            <Button className="px-2 py-1 text-xs" onClick={() =>
              setPanelState({
                timelineOpen: currentState.timelineOpen,
                expanded: false,
                signature: panelSignature,
              })
            } type="button" variant="ghost">
              {t('executionPanel.hideDetails')}
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CompactMetric
            label={t('executionPanel.progressValue', {
              completed: model.run.completedStepCount,
              total: model.run.totalStepCount,
            })}
          />
          {model.run.retrievalCount > 0 ? (
            <CompactMetric
              label={t('executionPanel.retrievalCompact', {
                count: model.run.retrievalCount,
              })}
            />
          ) : null}
          {model.run.toolCount > 0 ? (
            <CompactMetric
              label={t('executionPanel.toolCompact', {
                count: model.run.toolCount,
              })}
            />
          ) : null}
          {model.activeStage ? (
            <CompactMetric
              label={localizeExecutionStepName(t, model.activeStage)}
              tone="active"
            />
          ) : null}
        </div>

        <div className="space-y-2">
          {model.steps.map((step, index) => (
            <ExecutionStepRow key={`${step.stepIndex}-${step.name}`} model={model} step={step} stepNumber={index + 1} />
          ))}
        </div>

        {model.latestRetrieval ? (
          <ExecutionPanelRetrievalCard retrieval={model.latestRetrieval} />
        ) : null}

        {model.latestTool ? (
          <ExecutionPanelToolCard
            onConfirmToolCall={onConfirmToolCall}
            tool={model.latestTool}
          />
        ) : null}

        <ExecutionPanelTimeline
          isOpen={currentState.timelineOpen}
          items={model.timeline}
          onToggle={() =>
            setPanelState({
              timelineOpen: !currentState.timelineOpen,
              expanded: true,
              signature: panelSignature,
            })
          }
        />
      </div>
    </section>
  )
}

function ExecutionStepRow({
  model,
  step,
  stepNumber,
}: {
  model: ExecutionPanelModel
  step: ExecutionStepSummary
  stepNumber: number
}) {
  const { t } = useI18n()
  const retrieval = model.retrievals.find((item) => item.stepName === step.name) ?? null
  const stepDescription = retrieval
    ? t('executionPanel.retrievalStats', {
        results: retrieval.resultCount,
        citations: retrieval.citationCount,
        spaces: retrieval.knowledgeSpaceCount,
      })
    : step.name === model.activeStage
      ? (model.latestTool?.outputPreview ?? '')
      : ''

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)]/80 px-3 py-2.5',
        step.name === model.activeStage ? 'ring-1 ring-[var(--brand)]/25' : '',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--app-bg)] px-1.5 text-[11px] font-semibold text-[var(--muted-foreground)]">
            {stepNumber}
          </span>
          <ExecutionStatusIcon className="h-4 w-4" status={step.status} />
          <span className="truncate text-sm font-medium text-[var(--foreground)]">
            {localizeExecutionStepName(t, step.name)}
          </span>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px] font-medium',
            executionStatusBadgeClassName(step.status),
          )}
        >
          {t(`executionPanel.status.${step.status}`)}
        </span>
      </div>

      {stepDescription ? (
        <p className="mt-2 pl-8 text-xs leading-5 text-[var(--muted-foreground)]">
          {stepDescription}
        </p>
      ) : null}
    </div>
  )
}

function CompactMetric({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'active'
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium',
        tone === 'active'
          ? 'border-[var(--brand)]/30 bg-[var(--brand)]/12 text-[var(--foreground)]'
          : 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)]',
      )}
    >
      {label}
    </span>
  )
}
