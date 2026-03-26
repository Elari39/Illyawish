import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { TestProviders } from '../../../test/test-providers'
import { MessageBubble } from './message-bubble'

describe('MessageBubble', () => {
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
            conversationId: 1,
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
})
