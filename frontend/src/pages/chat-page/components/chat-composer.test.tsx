import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { ChatComposer } from './chat-composer'
import { ATTACHMENT_INPUT_ACCEPT } from '../utils'

describe('ChatComposer', () => {
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
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
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
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
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
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
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
})
