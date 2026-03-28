import { ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../../components/ui/button'
import { useI18n } from '../../../i18n/use-i18n'
import { cn } from '../../../lib/utils'
import { ExecutionPanelCollapsedSummary } from './execution-panel-collapsed-summary'
import { ExecutionPanelHeader } from './execution-panel-header'
import type { ExecutionPanelModel } from './execution-panel-model'
import { ExecutionPanelRetrievalCard } from './execution-panel-retrieval-card'
import { ExecutionPanelStageRail } from './execution-panel-stage-rail'
import { executionStatusPanelClassName } from './execution-panel-status'
import { ExecutionPanelTimeline } from './execution-panel-timeline'
import { ExecutionPanelToolCard } from './execution-panel-tool-card'

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

  return (
    <section
      className={cn(
        'mb-4 rounded-[1.7rem] border p-4 shadow-sm transition-colors',
        executionStatusPanelClassName(model.run.status),
      )}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            onClick={() =>
              setPanelState({
                timelineOpen: currentState.timelineOpen,
                expanded: false,
                signature: panelSignature,
              })
            }
            type="button"
            variant="ghost"
          >
            {t('executionPanel.hideDetails')}
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>

        <ExecutionPanelHeader model={model} />
        <ExecutionPanelStageRail model={model} />

        <div className="grid gap-4 lg:grid-cols-2">
          {model.latestRetrieval ? (
            <ExecutionPanelRetrievalCard retrieval={model.latestRetrieval} />
          ) : null}
          {model.latestTool ? (
            <ExecutionPanelToolCard
              onConfirmToolCall={onConfirmToolCall}
              tool={model.latestTool}
            />
          ) : null}
        </div>

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
