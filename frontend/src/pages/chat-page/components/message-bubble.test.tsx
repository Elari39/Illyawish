import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import type { ExecutionPanelModel } from './execution-panel-model'
import { MessageBubble } from './message-bubble'

describe('MessageBubble', () => {
  const writeText = vi.fn<(_: string) => Promise<void>>()
  const showToast = vi.fn()
  const executionModel: ExecutionPanelModel = {
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
      {
        name: 'compose_answer',
        status: 'completed',
        stepIndex: 2,
      },
      {
        name: 'finalize',
        status: 'completed',
        stepIndex: 3,
      },
    ],
    retrievals: [],
    tools: [],
    latestRetrieval: null,
    latestTool: null,
    collapsedSummary: {
      status: 'completed',
      templateKey: 'knowledge_qa',
      completedStepCount: 4,
      totalStepCount: 4,
      hasRetrievalActivity: true,
      hasToolActivity: false,
    },
    timeline: [],
  }

  beforeEach(() => {
    writeText.mockReset()
    showToast.mockReset()
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders mixed user attachments as image previews and file links', () => {
    render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          executionPanelModel={null}
          isEditing={false}
          message={{
            id: 1,
            conversationId: '1',
            role: 'user',
            content: 'Please review the file.',
            attachments: [
              {
                id: 'image-1',
                name: 'diagram.png',
                mimeType: 'image/png',
                size: 512,
                url: '/api/attachments/image-1/file',
              },
              {
                id: 'file-1',
                name: 'notes.pdf',
                mimeType: 'application/pdf',
                size: 2048,
                url: '/api/attachments/file-1/file',
              },
            ],
            status: 'completed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={vi.fn()}
          onRetry={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByAltText('diagram.png')).toBeInTheDocument()
    const fileLink = screen.getByRole('link', { name: /notes\.pdf/i })
    expect(fileLink).toHaveAttribute('href', '/api/attachments/file-1/file')
    expect(screen.getByText('application/pdf · 2 KB')).toBeInTheDocument()
  })

  it('copies only the user message content and shows copied feedback', async () => {
    vi.useFakeTimers()
    writeText.mockResolvedValue(undefined)

    render(
      <TestProviders>
        <MessageBubble
          canEdit
          canRegenerate={false}
          canRetry={false}
          executionPanelModel={null}
          isEditing={false}
          message={{
            id: 11,
            conversationId: '1',
            role: 'user',
            content: 'Please review the file.',
            attachments: [
              {
                id: 'image-1',
                name: 'diagram.png',
                mimeType: 'image/png',
                size: 512,
                url: '/api/attachments/image-1/file',
              },
            ],
            status: 'completed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={vi.fn()}
          onRetry={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('Please review the file.')
    expect(showToast).toHaveBeenCalledWith('Copied', 'success')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1200)
    })

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('shows copy with regenerate for completed assistant replies and copy with retry for stopped replies', () => {
    const regenerateSpy = vi.fn()
    const retrySpy = vi.fn()

    const { rerender } = render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate
          canRetry={false}
          executionPanelModel={null}
          isEditing={false}
          message={{
            id: 2,
            conversationId: '1',
            role: 'assistant',
            content: 'Completed answer',
            attachments: [],
            status: 'completed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={regenerateSpy}
          onRetry={retrySpy}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    screen.getByRole('button', { name: 'Regenerate' }).click()
    expect(regenerateSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    rerender(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry
          executionPanelModel={null}
          isEditing={false}
          message={{
            id: 3,
            conversationId: '1',
            role: 'assistant',
            content: 'Stopped answer',
            attachments: [],
            status: 'cancelled',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={regenerateSpy}
          onRetry={retrySpy}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retrySpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument()
  })

  it('renders the execution chain above assistant content and keeps user messages unchanged', () => {
    const { rerender } = render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          executionPanelModel={executionModel}
          isEditing={false}
          message={{
            id: 21,
            conversationId: '1',
            role: 'assistant',
            content: 'This is the final answer.',
            attachments: [],
            status: 'completed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={vi.fn()}
          onRetry={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByText('Knowledge Q&A')).toBeInTheDocument()
    expect(screen.getByText('4/4 steps')).toBeInTheDocument()
    const answerText = screen.getByText('This is the final answer.')
    const summaryButton = screen.getByRole('button', { name: 'Show details' })
    expect(
      summaryButton.compareDocumentPosition(answerText) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    rerender(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          executionPanelModel={executionModel}
          isEditing={false}
          message={{
            id: 22,
            conversationId: '1',
            role: 'user',
            content: 'User message',
            attachments: [],
            status: 'completed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onEdit={vi.fn()}
          onCopySuccessToast={showToast}
          onRegenerate={vi.fn()}
          onRetry={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.queryByText('Knowledge Q&A')).not.toBeInTheDocument()
    expect(screen.getByText('User message')).toBeInTheDocument()
  })
})
