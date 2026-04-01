import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { ChatComposer } from './chat-composer'
import { ATTACHMENT_INPUT_ACCEPT } from '../utils'

describe('ChatComposer', () => {
  it('renders a hero composer layout when requested', () => {
    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          layoutMode="hero"
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByTestId('chat-composer')).toHaveAttribute('data-layout', 'hero')
  })

  it('renders the model control before the send action', () => {
    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue="hello"
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          modelControl={<div data-testid="composer-model-control">Model</div>}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    const modelControl = screen.getByTestId('composer-model-control')
    const sendButton = screen.getByRole('button', { name: 'Send message' })

    expect(modelControl.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('forwards pasted images to the upload handler', () => {
    const onFilesSelected = vi.fn()

    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onToggleExpanded={vi.fn()}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={onFilesSelected}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    const textarea = screen.getByPlaceholderText('Message Illyawish...')
    const file = new File(['image-bytes'], 'paste.png', { type: 'image/png' })

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file],
      },
    })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('forwards dropped files to the upload handler', () => {
    const onFilesSelected = vi.fn()

    const { container } = render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={onFilesSelected}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    const form = container.querySelector('form')
    const file = new File(['plain text'], 'drop.txt', { type: 'text/plain' })

    if (!form) {
      throw new Error('Composer form not found')
    }

    fireEvent.drop(form, {
      dataTransfer: {
        files: [file],
      },
    })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('uses the expanded attachment accept list and renders document cards', () => {
    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedAttachments={[
            {
              id: 'attachment-1',
              name: 'notes.pdf',
              mimeType: 'application/pdf',
              size: 2048,
              attachment: {
                id: 'attachment-1',
                name: 'notes.pdf',
                mimeType: 'application/pdf',
                size: 2048,
                url: '/api/attachments/attachment-1/file',
              },
              isUploading: false,
              revokeOnCleanup: false,
            },
          ]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByText('notes.pdf')).toBeInTheDocument()
    expect(screen.getByText('application/pdf · 2 KB')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove attachment notes.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach file')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach file').closest('button')).toBeInTheDocument()
    expect(document.querySelector(`input[type="file"]`)).toHaveAttribute(
      'accept',
      ATTACHMENT_INPUT_ACCEPT,
    )
  })

  it('switches the primary action into a stop button while sending', () => {
    const onStopGeneration = vi.fn()

    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue="hello"
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={onStopGeneration}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(onStopGeneration).toHaveBeenCalledTimes(1)
  })

  it('shows an expand editor action when the textarea content exceeds the compact max height', async () => {
    const scrollHeightGetter = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(420)

    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue={'Long message\n'.repeat(20)}
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onToggleExpanded={vi.fn()}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    expect(await screen.findByRole('button', { name: 'Expand editor' })).toBeInTheDocument()
    scrollHeightGetter.mockRestore()
  })

  it('toggles into and out of the page-expanded composer state', async () => {
    const scrollHeightGetter = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(420)
    const onToggleExpanded = vi.fn()

    const { rerender } = render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue={'Long message\n'.repeat(20)}
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          isExpanded={false}
          onToggleExpanded={onToggleExpanded}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Expand editor' }))
    expect(onToggleExpanded).toHaveBeenCalledWith(true)

    rerender(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue={'Long message\n'.repeat(20)}
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer
          isSending={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          isExpanded
          onToggleExpanded={onToggleExpanded}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByTestId('chat-composer')).toHaveAttribute('data-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse editor' }))
    expect(onToggleExpanded).toHaveBeenCalledWith(false)
    scrollHeightGetter.mockRestore()
  })

  it('renders chat errors as a dismissible alert', () => {
    const onDismissChatError = vi.fn()

    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedAttachments={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          isSending={false}
          chatError={{
            id: 1,
            message: 'start model stream: error, status code: 404, status: 404 Not Found, message: 模型不存在',
          }}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onDismissChatError={onDismissChatError}
          onStopGeneration={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={vi.fn()}
          onRemoveAttachment={vi.fn()}
        />
      </TestProviders>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('start model stream: error, status code: 404, status: 404 Not Found, message: 模型不存在')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onDismissChatError).toHaveBeenCalledTimes(1)
  })
})
