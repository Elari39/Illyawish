import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import type { ExecutionPanelModel } from './execution-panel-model'
import { ExecutionPanel } from './execution-panel'

const completedModel: ExecutionPanelModel = {
  displayState: 'collapsed',
  run: {
    status: 'completed',
    templateKey: 'knowledge_qa',
    currentStepName: null,
    completedStepCount: 4,
    totalStepCount: 4,
    retrievalCount: 1,
    toolCount: 0,
  },
  activeStage: null,
  progressPercent: 100,
  hasWarnings: false,
  steps: [
    {
      name: 'question',
      status: 'completed',
      stepIndex: 0,
    },
    {
      name: 'retrieve_knowledge',
      status: 'completed',
      stepIndex: 1,
    },
  ],
  retrievals: [
    {
      stepName: 'retrieve_knowledge',
      status: 'completed',
      resultCount: 2,
      knowledgeSpaceCount: 1,
      citationCount: 2,
      citationNames: ['OpenAI.md', 'Guide.md'],
      displayCitationNames: ['OpenAI.md', 'Guide.md'],
      overflowCitationCount: 0,
    },
  ],
  tools: [],
  latestRetrieval: {
    stepName: 'retrieve_knowledge',
    status: 'completed',
    resultCount: 2,
    knowledgeSpaceCount: 1,
    citationCount: 2,
    citationNames: ['OpenAI.md', 'Guide.md'],
    displayCitationNames: ['OpenAI.md', 'Guide.md'],
    overflowCitationCount: 0,
  },
  latestTool: null,
  collapsedSummary: {
    status: 'completed',
    templateKey: 'knowledge_qa',
    completedStepCount: 4,
    totalStepCount: 4,
    hasRetrievalActivity: true,
    hasToolActivity: false,
  },
  timeline: [
    {
      type: 'run_started',
      status: 'completed',
      title: 'Run started',
      description: 'knowledge_qa',
    },
  ],
}

const waitingModel: ExecutionPanelModel = {
  displayState: 'expanded',
  run: {
    status: 'waiting_confirmation',
    templateKey: 'webpage_digest',
    currentStepName: 'fetch_page',
    completedStepCount: 1,
    totalStepCount: 4,
    retrievalCount: 0,
    toolCount: 1,
  },
  activeStage: 'fetch_page',
  progressPercent: 25,
  hasWarnings: true,
  steps: [
    {
      name: 'question',
      status: 'completed',
      stepIndex: 0,
    },
    {
      name: 'fetch_page',
      status: 'waiting_confirmation',
      stepIndex: 1,
    },
    {
      name: 'compose_answer',
      status: 'running',
      stepIndex: 2,
    },
  ],
  retrievals: [],
  tools: [
    {
      toolName: 'http_request',
      status: 'waiting_confirmation',
      confirmationId: 'confirm-1',
      confirmationLabel: 'Confirm HTTP request',
      outputPreview: '',
    },
  ],
  latestRetrieval: null,
  latestTool: {
    toolName: 'http_request',
    status: 'waiting_confirmation',
    confirmationId: 'confirm-1',
    confirmationLabel: 'Confirm HTTP request',
    outputPreview: '',
  },
  collapsedSummary: {
    status: 'waiting_confirmation',
    templateKey: 'webpage_digest',
    completedStepCount: 1,
    totalStepCount: 4,
    hasRetrievalActivity: false,
    hasToolActivity: true,
  },
  timeline: [
    {
      type: 'tool_call_confirmation_required',
      status: 'waiting_confirmation',
      title: 'Tool confirmation required',
      description: 'http_request',
    },
  ],
}

const runningModel: ExecutionPanelModel = {
  displayState: 'expanded',
  run: {
    status: 'running',
    templateKey: 'knowledge_qa',
    currentStepName: 'compose_answer',
    completedStepCount: 2,
    totalStepCount: 4,
    retrievalCount: 2,
    toolCount: 1,
  },
  activeStage: 'compose_answer',
  progressPercent: 50,
  hasWarnings: false,
  steps: [
    {
      name: 'question',
      status: 'completed',
      stepIndex: 0,
    },
    {
      name: 'retrieve_knowledge',
      status: 'completed',
      stepIndex: 1,
    },
    {
      name: 'compose_answer',
      status: 'running',
      stepIndex: 2,
    },
    {
      name: 'finalize',
      status: 'running',
      stepIndex: 3,
    },
  ],
  retrievals: [
    {
      stepName: 'retrieve_knowledge',
      status: 'completed',
      resultCount: 12,
      knowledgeSpaceCount: 2,
      citationCount: 5,
      citationNames: ['A.md', 'B.md', 'C.md', 'D.md', 'E.md'],
      displayCitationNames: ['A.md', 'B.md', 'C.md'],
      overflowCitationCount: 2,
    },
  ],
  tools: [
    {
      toolName: 'fetch_url',
      status: 'completed',
      outputPreview: 'Fetched the latest digest',
    },
  ],
  latestRetrieval: {
    stepName: 'retrieve_knowledge',
    status: 'completed',
    resultCount: 12,
    knowledgeSpaceCount: 2,
    citationCount: 5,
    citationNames: ['A.md', 'B.md', 'C.md', 'D.md', 'E.md'],
    displayCitationNames: ['A.md', 'B.md', 'C.md'],
    overflowCitationCount: 2,
  },
  latestTool: {
    toolName: 'fetch_url',
    status: 'completed',
    outputPreview: 'Fetched the latest digest',
  },
  collapsedSummary: {
    status: 'running',
    templateKey: 'knowledge_qa',
    completedStepCount: 2,
    totalStepCount: 4,
    hasRetrievalActivity: true,
    hasToolActivity: true,
  },
  timeline: [
    {
      type: 'run_started',
      status: 'running',
      title: 'Run started',
      description: 'knowledge_qa',
    },
    {
      type: 'workflow_step_started',
      status: 'running',
      title: 'Step started',
      description: 'compose_answer',
    },
  ],
}

describe('ExecutionPanel', () => {
  it('renders a collapsed summary band for completed runs and expands details on demand', () => {
    render(
      <TestProviders>
        <ExecutionPanel
          model={completedModel}
          onConfirmToolCall={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByText('Knowledge Q&A')).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
    expect(screen.queryByText('Current stage')).not.toBeInTheDocument()
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('4/4 steps')).toBeInTheDocument()
    expect(screen.getByText('Timeline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }))

    expect(screen.queryByText('Current stage')).not.toBeInTheDocument()
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
  })

  it('renders the runtime dashboard with stage rail and latest retrieval summary', () => {
    render(
      <TestProviders>
        <ExecutionPanel
          model={runningModel}
          onConfirmToolCall={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.queryByText('Execution progress')).not.toBeInTheDocument()
    expect(screen.getAllByText('Compose answer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Knowledge retrieval').length).toBeGreaterThan(0)
    expect(screen.getByText('Fetch URL')).toBeInTheDocument()
    expect(screen.getByText('A.md')).toBeInTheDocument()
    expect(screen.getByText('B.md')).toBeInTheDocument()
    expect(screen.getByText('C.md')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('Run started')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide timeline' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show timeline' }))

    expect(screen.getByText('Run started')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide timeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide timeline' }))

    expect(screen.queryByText('Run started')).not.toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
  })

  it('renders confirmation actions inside the tool card', () => {
    const onConfirmToolCall = vi.fn()

    render(
      <TestProviders>
        <ExecutionPanel
          model={waitingModel}
          onConfirmToolCall={onConfirmToolCall}
        />
      </TestProviders>,
    )

    expect(screen.getByText('HTTP request')).toBeInTheDocument()
    expect(screen.getAllByText('Waiting for confirmation').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(onConfirmToolCall).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })
})
