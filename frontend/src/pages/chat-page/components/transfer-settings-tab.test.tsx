import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { Conversation } from '../../../types/chat'
import { TestProviders } from '../../../test/test-providers'
import { IMPORT_CONVERSATION_INPUT_ACCEPT } from '../types'
import { TransferSettingsTab } from './transfer-settings-tab'

const conversation: Conversation = {
  id: 1,
  title: 'Project notes',
  isPinned: false,
  isArchived: false,
  folder: '',
  tags: [],
  settings: {
    systemPrompt: 'You are a helpful assistant.',
    model: '',
    temperature: 1,
    maxTokens: null,
  contextWindowTurns: null,
  },
  createdAt: '2026-03-26T00:00:00Z',
  updatedAt: '2026-03-26T00:00:00Z',
}

describe('TransferSettingsTab', () => {
  it('disables export without messages and exposes the import accept list', () => {
    const onExport = vi.fn()

    const { container } = render(
      <TestProviders>
        <TransferSettingsTab
          conversation={conversation}
          isImporting={false}
          messageCount={0}
          onExport={onExport}
          onImport={vi.fn()}
        />
      </TestProviders>,
    )

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      IMPORT_CONVERSATION_INPUT_ACCEPT,
    )
  })

  it('forwards the selected markdown file to the import handler', () => {
    const onImport = vi.fn()
    const file = new File(['# Hello'], 'hello.md', { type: 'text/markdown' })
    const { container } = render(
      <TestProviders>
        <TransferSettingsTab
          conversation={conversation}
          isImporting={false}
          messageCount={2}
          onExport={vi.fn()}
          onImport={onImport}
        />
      </TestProviders>,
    )

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    expect(onImport).toHaveBeenCalledWith(file)
  })
})
