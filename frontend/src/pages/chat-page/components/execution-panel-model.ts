import type { StreamEvent } from '../../../types/chat'

export type ExecutionPanelDisplayState = 'expanded' | 'collapsed'
export type ExecutionRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_confirmation'
export type ExecutionItemStatus = 'running' | 'completed' | 'failed' | 'waiting_confirmation'

export interface ExecutionRunSummary {
  status: ExecutionRunStatus
  templateKey: string
  currentStepName: string | null
  completedStepCount: number
  totalStepCount: number
  retrievalCount: number
  toolCount: number
}

export interface ExecutionStepSummary {
  name: string
  status: ExecutionItemStatus
  stepIndex: number
}

export interface ExecutionRetrievalSummary {
  stepName: string
  status: 'completed'
  resultCount: number
  knowledgeSpaceCount: number
  citationCount: number
  citationNames: string[]
  displayCitationNames: string[]
  overflowCitationCount: number
}

export interface ExecutionToolSummary {
  toolName: string
  status: 'running' | 'completed' | 'waiting_confirmation'
  confirmationId?: string
  confirmationLabel?: string
  outputPreview: string
}

export interface ExecutionTimelineItem {
  type: StreamEvent['type']
  status: ExecutionRunStatus | ExecutionItemStatus
  title: string
  description: string
}

export interface ExecutionCollapsedSummary {
  status: ExecutionRunStatus
  templateKey: string
  completedStepCount: number
  totalStepCount: number
  hasRetrievalActivity: boolean
  hasToolActivity: boolean
}

export interface ExecutionPanelModel {
  displayState: ExecutionPanelDisplayState
  run: ExecutionRunSummary
  activeStage: string | null
  progressPercent: number
  hasWarnings: boolean
  steps: ExecutionStepSummary[]
  retrievals: ExecutionRetrievalSummary[]
  tools: ExecutionToolSummary[]
  latestRetrieval: ExecutionRetrievalSummary | null
  latestTool: ExecutionToolSummary | null
  collapsedSummary: ExecutionCollapsedSummary
  timeline: ExecutionTimelineItem[]
}

interface MutableExecutionStepSummary extends ExecutionStepSummary {
  order: number
}

const DASHBOARD_CITATION_LIMIT = 3

export function buildExecutionPanelModel(
  events: StreamEvent[],
  pendingConfirmationId: string | null,
): ExecutionPanelModel | null {
  if (events.length === 0 && !pendingConfirmationId) {
    return null
  }

  let templateKey = ''
  let runStatus: ExecutionRunStatus = pendingConfirmationId ? 'waiting_confirmation' : 'running'
  const stepsByName = new Map<string, MutableExecutionStepSummary>()
  const retrievals: ExecutionRetrievalSummary[] = []
  const tools: ExecutionToolSummary[] = []
  const timeline: ExecutionTimelineItem[] = []

  for (const event of events) {
    if (event.type === 'run_started') {
      templateKey = stringMetadata(event, 'templateKey')
      timeline.push({
        type: event.type,
        status: 'running',
        title: 'Run started',
        description: templateKey,
      })
      continue
    }

    if (event.type === 'workflow_step_started' || event.type === 'workflow_step_completed') {
      const stepName = event.stepName ?? ''
      const stepIndex = numberMetadata(event, 'stepIndex', stepsByName.size)
      const existing = stepsByName.get(stepName)
      if (existing) {
        existing.status = event.type === 'workflow_step_completed' ? 'completed' : existing.status
        existing.stepIndex = stepIndex
      } else {
        stepsByName.set(stepName, {
          name: stepName,
          status: event.type === 'workflow_step_completed' ? 'completed' : 'running',
          stepIndex,
          order: stepsByName.size,
        })
      }
      timeline.push({
        type: event.type,
        status: event.type === 'workflow_step_completed' ? 'completed' : 'running',
        title: event.type === 'workflow_step_completed' ? 'Step completed' : 'Step started',
        description: stepName,
      })
      continue
    }

    if (event.type === 'retrieval_started') {
      timeline.push({
        type: event.type,
        status: 'running',
        title: 'Retrieval started',
        description: event.stepName ?? '',
      })
      continue
    }

    if (event.type === 'retrieval_completed') {
      const citationNames = uniqueNames(event.citations?.map((citation) => citation.documentName) ?? [])
      retrievals.push({
        stepName: event.stepName ?? '',
        status: 'completed',
        resultCount: numberMetadata(event, 'resultCount', event.citations?.length ?? 0),
        knowledgeSpaceCount: numberMetadata(event, 'knowledgeSpaceCount', 0),
        citationCount: event.citations?.length ?? 0,
        citationNames,
        displayCitationNames: citationNames.slice(0, DASHBOARD_CITATION_LIMIT),
        overflowCitationCount: Math.max(citationNames.length - DASHBOARD_CITATION_LIMIT, 0),
      })
      timeline.push({
        type: event.type,
        status: 'completed',
        title: 'Retrieval completed',
        description: citationNames.join(', '),
      })
      continue
    }

    if (event.type === 'tool_call_started') {
      tools.push({
        toolName: event.toolName ?? '',
        status: 'running',
        outputPreview: '',
      })
      timeline.push({
        type: event.type,
        status: 'running',
        title: 'Tool started',
        description: event.toolName ?? '',
      })
      continue
    }

    if (event.type === 'tool_call_confirmation_required') {
      const isActivePendingConfirmation =
        pendingConfirmationId != null &&
        (event.confirmationId == null || event.confirmationId === pendingConfirmationId)
      const tool = findLastTool(tools, event.toolName)
      if (tool) {
        tool.status = isActivePendingConfirmation ? 'waiting_confirmation' : 'running'
        tool.confirmationId = isActivePendingConfirmation ? (event.confirmationId ?? '') : undefined
        tool.confirmationLabel = isActivePendingConfirmation
          ? stringMetadata(event, 'confirmationLabel')
          : undefined
      }
      if (isActivePendingConfirmation) {
        const currentStep = findLatestIncompleteStep(stepsByName)
        if (currentStep) {
          currentStep.status = 'waiting_confirmation'
        }
        runStatus = 'waiting_confirmation'
      }
      timeline.push({
        type: event.type,
        status: isActivePendingConfirmation ? 'waiting_confirmation' : 'running',
        title: 'Tool confirmation required',
        description: event.toolName ?? '',
      })
      continue
    }

    if (event.type === 'tool_call_completed') {
      const tool = findLastTool(tools, event.toolName)
      if (tool) {
        tool.status = 'completed'
        tool.outputPreview = stringMetadata(event, 'outputPreview') || previewText(event.content ?? '', 120)
      }
      timeline.push({
        type: event.type,
        status: 'completed',
        title: 'Tool completed',
        description: event.toolName ?? '',
      })
      continue
    }

    if (event.type === 'done') {
      runStatus = 'completed'
      timeline.push({
        type: event.type,
        status: 'completed',
        title: 'Run completed',
        description: '',
      })
      continue
    }

    if (event.type === 'cancelled') {
      runStatus = 'cancelled'
      timeline.push({
        type: event.type,
        status: 'cancelled',
        title: 'Run cancelled',
        description: '',
      })
      continue
    }

    if (event.type === 'error') {
      runStatus = 'failed'
      timeline.push({
        type: event.type,
        status: 'failed',
        title: 'Run failed',
        description: event.error ?? '',
      })
    }
  }

  if (pendingConfirmationId && runStatus !== 'failed' && runStatus !== 'cancelled') {
    runStatus = 'waiting_confirmation'
  }

  const orderedSteps = Array.from(stepsByName.values())
    .sort((left, right) => left.stepIndex - right.stepIndex || left.order - right.order)
    .map((step) => ({
      name: step.name,
      status: step.status,
      stepIndex: step.stepIndex,
    }))

  const completedStepCount = orderedSteps.filter((step) => step.status === 'completed').length
  const currentStepName = orderedSteps.find((step) => step.status !== 'completed')?.name ?? null
  const progressPercent = calculateProgressPercent(completedStepCount, orderedSteps.length, runStatus)
  const latestRetrieval = retrievals.at(-1) ?? null
  const latestTool = tools.at(-1) ?? null

  if (orderedSteps.length === 0 && retrievals.length === 0 && tools.length === 0 && !pendingConfirmationId) {
    return null
  }

  return {
    displayState: runStatus === 'completed' ? 'collapsed' : 'expanded',
    run: {
      status: runStatus,
      templateKey,
      currentStepName,
      completedStepCount,
      totalStepCount: orderedSteps.length,
      retrievalCount: retrievals.length,
      toolCount: tools.length,
    },
    activeStage: runStatus === 'completed' ? null : currentStepName,
    progressPercent,
    hasWarnings:
      runStatus === 'waiting_confirmation' || runStatus === 'failed' || runStatus === 'cancelled',
    steps: orderedSteps,
    retrievals,
    tools,
    latestRetrieval,
    latestTool,
    collapsedSummary: {
      status: runStatus,
      templateKey,
      completedStepCount,
      totalStepCount: orderedSteps.length,
      hasRetrievalActivity: retrievals.length > 0,
      hasToolActivity: tools.length > 0,
    },
    timeline,
  }
}

function calculateProgressPercent(
  completedStepCount: number,
  totalStepCount: number,
  status: ExecutionRunStatus,
) {
  if (totalStepCount === 0) {
    return status === 'completed' ? 100 : 0
  }

  return Math.round((completedStepCount / totalStepCount) * 100)
}

function numberMetadata(event: StreamEvent, key: string, fallback: number): number {
  const value = event.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringMetadata(event: StreamEvent, key: string): string {
  const value = event.metadata?.[key]
  return typeof value === 'string' ? value : ''
}

function findLastTool(tools: ExecutionToolSummary[], toolName: string | undefined) {
  if (!toolName) {
    return null
  }
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    if (tools[index].toolName === toolName) {
      return tools[index]
    }
  }
  return null
}

function findLatestIncompleteStep(steps: Map<string, MutableExecutionStepSummary>) {
  const values = Array.from(steps.values()).sort((left, right) => right.stepIndex - left.stepIndex)
  return values.find((step) => step.status !== 'completed') ?? null
}

function uniqueNames(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim() !== '')))
}

function previewText(value: string, maxRunes: number) {
  const text = value.trim()
  const runes = Array.from(text)
  if (runes.length <= maxRunes) {
    return text
  }
  return `${runes.slice(0, maxRunes).join('')}...`
}
