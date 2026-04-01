import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { MessageBubble } from './message-bubble'

describe('MessageBubble', () => {
  const writeText = vi.fn<(_: string) => Promise<void>>()
  const showToast = vi.fn()
  const editMessage = vi.fn()
  const regenerateMessage = vi.fn()
  const retryMessage = vi.fn()
  beforeEach(() => {
    writeText.mockReset()
    showToast.mockReset()
    editMessage.mockReset()
    regenerateMessage.mockReset()
    retryMessage.mockReset()
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateSpy}
          onRetryMessage={retrySpy}
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateSpy}
          onRetryMessage={retrySpy}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retrySpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument()
  })

  it('renders an interruption fallback for failed assistant replies without content', () => {
    render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry
          isEditing={false}
          message={{
            id: 4,
            conversationId: '1',
            role: 'assistant',
            content: '',
            attachments: [],
            status: 'failed',
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(
      screen.getByText('The assistant response ended unexpectedly.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
  })

  it('renders assistant final content without reasoning or execution controls', () => {
    const { rerender } = render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByText('This is the final answer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand reasoning' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument()

    rerender(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
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
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByText('User message')).toBeInTheDocument()
  })

  it('renders assistant reasoning before the final content and copies both sections', async () => {
    writeText.mockResolvedValue(undefined)

    render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          isEditing={false}
          message={{
            id: 23,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3',
            content: 'Final answer',
            attachments: [],
            status: 'completed',
            localReasoningStartedAt: 0,
            localReasoningCompletedAt: 18_000,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByText('step 1', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('18s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand reasoning' })).toBeInTheDocument()
    expect(screen.queryByText('step 3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('step 1\nstep 2\nstep 3\n\nFinal answer')
  })

  it('expands completed reasoning on demand and keeps it expanded across rerenders for the same message', () => {
    const { rerender } = render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          isEditing={false}
          message={{
            id: 24,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3',
            content: 'Final answer',
            attachments: [],
            status: 'completed',
            localReasoningStartedAt: 0,
            localReasoningCompletedAt: 18_000,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand reasoning' }))

    expect(screen.getByRole('button', { name: 'Collapse reasoning' })).toBeInTheDocument()
    expect(screen.getByText('step 3', { exact: false })).toBeInTheDocument()

    rerender(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          isEditing={false}
          message={{
            id: 24,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3\nstep 4',
            content: 'Updated answer',
            attachments: [],
            status: 'completed',
            localReasoningStartedAt: 0,
            localReasoningCompletedAt: 20_000,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Collapse reasoning' })).toBeInTheDocument()
    expect(screen.getByText('step 4', { exact: false })).toBeInTheDocument()
  })

  it('auto-collapses reasoning after a streaming message finishes when the user did not override it', () => {
    const { rerender } = render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          isEditing={false}
          message={{
            id: 25,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3',
            content: 'Streaming answer',
            attachments: [],
            status: 'streaming',
            localReasoningStartedAt: 0,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Collapse reasoning' })).toBeInTheDocument()
    expect(screen.getByText('step 3', { exact: false })).toBeInTheDocument()

    rerender(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry={false}
          isEditing={false}
          message={{
            id: 25,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3',
            content: 'Final answer',
            attachments: [],
            status: 'completed',
            localReasoningStartedAt: 0,
            localReasoningCompletedAt: 18_000,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Expand reasoning' })).toBeInTheDocument()
    expect(screen.queryByText('step 3')).not.toBeInTheDocument()
  })

  it('keeps failed assistant reasoning expanded so users can inspect where it stopped', () => {
    render(
      <TestProviders>
        <MessageBubble
          canEdit={false}
          canRegenerate={false}
          canRetry
          isEditing={false}
          message={{
            id: 26,
            conversationId: '1',
            role: 'assistant',
            reasoningContent: 'step 1\nstep 2\nstep 3',
            content: '',
            attachments: [],
            status: 'failed',
            localReasoningStartedAt: 0,
            localReasoningCompletedAt: 9_000,
            createdAt: '2026-03-26T00:00:00Z',
          }}
          onCopySuccessToast={showToast}
          onEditMessage={editMessage}
          onRegenerateMessage={regenerateMessage}
          onRetryMessage={retryMessage}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Collapse reasoning' })).toBeInTheDocument()
    expect(screen.getByText('step 3', { exact: false })).toBeInTheDocument()
  })
})
