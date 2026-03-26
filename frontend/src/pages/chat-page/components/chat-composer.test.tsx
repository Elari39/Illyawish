import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { ChatComposer } from './chat-composer'

describe('ChatComposer', () => {
  it('forwards pasted images to the upload handler', () => {
    const onFilesSelected = vi.fn()

    render(
      <TestProviders>
        <ChatComposer
          composerFormRef={createRef()}
          fileInputRef={createRef()}
          composerValue=""
          selectedImages={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={onFilesSelected}
          onRemoveImage={vi.fn()}
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
          selectedImages={[]}
          editingMessageId={null}
          hasPendingUploads={false}
          canSubmitComposer={false}
          chatError={null}
          composerIsComposingRef={{ current: false }}
          onComposerChange={vi.fn()}
          onCancelEdit={vi.fn()}
          onSubmit={vi.fn()}
          onFilesSelected={onFilesSelected}
          onRemoveImage={vi.fn()}
        />
      </TestProviders>,
    )

    const form = container.querySelector('form')
    const file = new File(['image-bytes'], 'drop.png', { type: 'image/png' })

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
})
