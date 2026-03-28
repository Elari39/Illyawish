import { describe, expect, it } from 'vitest'

import type { StreamEvent } from '../../../types/chat'
import { buildExecutionPanelModel } from './execution-panel-model'

function createEvent(event: StreamEvent): StreamEvent {
  return event
}

describe('buildExecutionPanelModel', () => {
  it('returns null when the run has no meaningful workflow activity', () => {
    const model = buildExecutionPanelModel([
      createEvent({
        type: 'run_started',
        metadata: {
          templateKey: 'knowledge_qa',
        },
      }),
      createEvent({
        type: 'done',
      }),
    ], null)

    expect(model).toBeNull()
  })

  it('aggregates step, retrieval, and completion state from raw events', () => {
    const model = buildExecutionPanelModel([
      createEvent({
        type: 'run_started',
        metadata: {
          templateKey: 'knowledge_qa',
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'question',
        metadata: {
          stepIndex: 0,
        },
      }),
      createEvent({
        type: 'workflow_step_completed',
        stepName: 'question',
        metadata: {
          stepIndex: 0,
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'retrieve_knowledge',
        metadata: {
          stepIndex: 1,
        },
      }),
      createEvent({
        type: 'retrieval_started',
        stepName: 'retrieve_knowledge',
      }),
      createEvent({
        type: 'retrieval_completed',
        stepName: 'retrieve_knowledge',
        citations: [
          {
            documentId: 1,
            documentName: 'OpenAI.md',
            chunkId: 7,
            snippet: 'Embeddings',
            sourceUri: '',
          },
          {
            documentId: 2,
            documentName: 'Guide.md',
            chunkId: 9,
            snippet: 'Reranking',
            sourceUri: '',
          },
        ],
        metadata: {
          resultCount: 2,
          knowledgeSpaceCount: 1,
        },
      }),
      createEvent({
        type: 'workflow_step_completed',
        stepName: 'retrieve_knowledge',
        metadata: {
          stepIndex: 1,
        },
      }),
      createEvent({
        type: 'done',
      }),
    ], null)
    expect(model).not.toBeNull()
    if (!model) {
      throw new Error('expected execution panel model')
    }

    expect(model.run.status).toBe('completed')
    expect(model.displayState).toBe('collapsed')
    expect(model.run.templateKey).toBe('knowledge_qa')
    expect(model.run.completedStepCount).toBe(2)
    expect(model.activeStage).toBeNull()
    expect(model.progressPercent).toBe(100)
    expect(model.hasWarnings).toBe(false)
    expect(model.collapsedSummary).toMatchObject({
      status: 'completed',
      templateKey: 'knowledge_qa',
      completedStepCount: 2,
      totalStepCount: 2,
      hasRetrievalActivity: true,
      hasToolActivity: false,
    })
    expect(model.steps.map((step) => step.name)).toEqual(['question', 'retrieve_knowledge'])
    expect(model.retrievals).toHaveLength(1)
    expect(model.retrievals[0]).toMatchObject({
      stepName: 'retrieve_knowledge',
      resultCount: 2,
      knowledgeSpaceCount: 1,
      citationCount: 2,
    })
    expect(model.retrievals[0].citationNames).toEqual(['OpenAI.md', 'Guide.md'])
    expect(model.latestRetrieval).toMatchObject({
      stepName: 'retrieve_knowledge',
      displayCitationNames: ['OpenAI.md', 'Guide.md'],
      overflowCitationCount: 0,
    })
    expect(model.latestTool).toBeNull()
  })

  it('keeps the panel expanded and marks tool confirmation as waiting', () => {
    const model = buildExecutionPanelModel([
      createEvent({
        type: 'run_started',
        metadata: {
          templateKey: 'webpage_digest',
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'fetch_page',
        metadata: {
          stepIndex: 1,
        },
      }),
      createEvent({
        type: 'tool_call_started',
        toolName: 'http_request',
      }),
      createEvent({
        type: 'tool_call_confirmation_required',
        toolName: 'http_request',
        confirmationId: 'confirm-1',
        metadata: {
          confirmationLabel: 'Confirm HTTP request',
        },
      }),
    ], 'confirm-1')
    expect(model).not.toBeNull()
    if (!model) {
      throw new Error('expected execution panel model')
    }

    expect(model.run.status).toBe('waiting_confirmation')
    expect(model.displayState).toBe('expanded')
    expect(model.activeStage).toBe('fetch_page')
    expect(model.progressPercent).toBe(0)
    expect(model.hasWarnings).toBe(true)
    expect(model.tools).toHaveLength(1)
    expect(model.tools[0]).toMatchObject({
      toolName: 'http_request',
      status: 'waiting_confirmation',
      confirmationId: 'confirm-1',
      confirmationLabel: 'Confirm HTTP request',
    })
    expect(model.latestTool).toMatchObject({
      toolName: 'http_request',
      status: 'waiting_confirmation',
    })
  })

  it('prefers the latest retrieval and trims citation chips for dashboard display', () => {
    const model = buildExecutionPanelModel([
      createEvent({
        type: 'run_started',
        metadata: {
          templateKey: 'knowledge_qa',
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'question',
        metadata: {
          stepIndex: 0,
        },
      }),
      createEvent({
        type: 'workflow_step_completed',
        stepName: 'question',
        metadata: {
          stepIndex: 0,
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'retrieve_knowledge',
        metadata: {
          stepIndex: 1,
        },
      }),
      createEvent({
        type: 'retrieval_completed',
        stepName: 'retrieve_knowledge',
        citations: [
          {
            documentId: 1,
            documentName: 'Old-A.md',
            chunkId: 1,
            snippet: 'old',
            sourceUri: '',
          },
        ],
        metadata: {
          resultCount: 8,
          knowledgeSpaceCount: 1,
        },
      }),
      createEvent({
        type: 'workflow_step_completed',
        stepName: 'retrieve_knowledge',
        metadata: {
          stepIndex: 1,
        },
      }),
      createEvent({
        type: 'workflow_step_started',
        stepName: 'compose_answer',
        metadata: {
          stepIndex: 2,
        },
      }),
      createEvent({
        type: 'retrieval_completed',
        stepName: 'compose_answer',
        citations: [
          {
            documentId: 2,
            documentName: 'Guide-A.md',
            chunkId: 2,
            snippet: 'a',
            sourceUri: '',
          },
          {
            documentId: 3,
            documentName: 'Guide-B.md',
            chunkId: 3,
            snippet: 'b',
            sourceUri: '',
          },
          {
            documentId: 4,
            documentName: 'Guide-C.md',
            chunkId: 4,
            snippet: 'c',
            sourceUri: '',
          },
          {
            documentId: 5,
            documentName: 'Guide-D.md',
            chunkId: 5,
            snippet: 'd',
            sourceUri: '',
          },
          {
            documentId: 6,
            documentName: 'Guide-E.md',
            chunkId: 6,
            snippet: 'e',
            sourceUri: '',
          },
        ],
        metadata: {
          resultCount: 24,
          knowledgeSpaceCount: 3,
        },
      }),
      createEvent({
        type: 'tool_call_started',
        toolName: 'fetch_url',
      }),
      createEvent({
        type: 'tool_call_completed',
        toolName: 'fetch_url',
        content: 'Raw output that should not be used directly',
        metadata: {
          outputPreview: 'Preview summary',
        },
      }),
    ], null)

    expect(model).not.toBeNull()
    if (!model) {
      throw new Error('expected execution panel model')
    }

    expect(model.run.status).toBe('running')
    expect(model.activeStage).toBe('compose_answer')
    expect(model.progressPercent).toBe(67)
    expect(model.latestRetrieval).toMatchObject({
      stepName: 'compose_answer',
      resultCount: 24,
      displayCitationNames: ['Guide-A.md', 'Guide-B.md', 'Guide-C.md'],
      overflowCitationCount: 2,
    })
    expect(model.latestTool).toMatchObject({
      toolName: 'fetch_url',
      status: 'completed',
      outputPreview: 'Preview summary',
    })
  })
})
