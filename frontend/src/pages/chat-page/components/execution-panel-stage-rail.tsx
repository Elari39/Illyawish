import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { localizeExecutionStepName } from './execution-panel-labels'
import type { ExecutionPanelModel } from './execution-panel-model'
import { executionStatusRailClassName } from './execution-panel-status'
import {
  ExecutionStatusIcon,
} from './execution-panel-visuals'

interface ExecutionPanelStageRailProps {
  model: ExecutionPanelModel
}

export function ExecutionPanelStageRail({
  model,
}: ExecutionPanelStageRailProps) {
  const { t } = useI18n()

  if (model.steps.length === 0) {
    return null
  }

  return (
    <section className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--app-bg)]/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--foreground)]">{t('executionPanel.stageRailTitle')}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {t('executionPanel.currentStage')}: {' '}
          <span className="font-medium text-[var(--foreground)]">
            {model.activeStage ? localizeExecutionStepName(t, model.activeStage) : t('executionPanel.none')}
          </span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {model.steps.map((step, index) => {
          const isActive = step.name === model.activeStage
          return (
            <div
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors',
                executionStatusRailClassName(step.status),
                isActive ? 'ring-2 ring-[var(--brand)]/20' : 'opacity-85',
              )}
              key={`${step.stepIndex}-${step.name}`}
            >
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">{index + 1}</span>
              <ExecutionStatusIcon className="h-3.5 w-3.5" status={step.status} />
              <span className="truncate font-medium">
                {localizeExecutionStepName(t, step.name)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
