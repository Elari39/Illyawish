import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APP_LOCALE_STORAGE_KEY } from '../../../i18n/config'
import { TestProviders } from '../../../test/test-providers'
import type { KnowledgeDocument, KnowledgeSpace } from '../../../types/chat'
import { KnowledgeSettingsTab } from './knowledge-settings-tab'

const spaces: KnowledgeSpace[] = [
  {
    id: 11,
    userId: 3,
    name: 'Engineering',
    description: 'Specs and notes',
    createdAt: '2026-03-26T09:08:00Z',
    updatedAt: '2026-03-26T09:08:00Z',
  },
]

const documents: Record<number, KnowledgeDocument[]> = {
  11: [
    {
      id: 1,
      userId: 3,
      knowledgeSpaceId: 11,
      title: 'Release checklist',
      sourceType: 'text',
      sourceUri: '',
      mimeType: '',
      content: 'Ship it carefully',
      status: 'ready',
      chunkCount: 1,
      lastIndexedAt: '2026-03-26T09:08:00Z',
      createdAt: '2026-03-26T09:08:00Z',
      updatedAt: '2026-03-26T09:08:00Z',
    },
    {
      id: 2,
      userId: 3,
      knowledgeSpaceId: 11,
      title: 'guide.md',
      sourceType: 'attachment',
      sourceUri: '',
      mimeType: 'text/markdown',
      content: '# Guide',
      status: 'ready',
      chunkCount: 2,
      lastIndexedAt: '2026-03-26T09:08:00Z',
      createdAt: '2026-03-26T09:08:00Z',
      updatedAt: '2026-03-26T09:08:00Z',
    },
  ],
}

describe('KnowledgeSettingsTab', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders localized knowledge labels in Chinese', async () => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, 'zh-CN')

    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={vi.fn()}
          deleteKnowledgeSpace={vi.fn()}
          knowledgeSpaces={spaces}
          knowledgeDocuments={{}}
          selectedKnowledgeSpaceIds={[]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={vi.fn()}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={vi.fn()}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={vi.fn()}
        />
      </TestProviders>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '知识空间' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '创建空间' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '添加文档' })).toBeInTheDocument()
    })
  })

  it('shows knowledge space actions and document actions from the API response', async () => {
    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={vi.fn()}
          deleteKnowledgeSpace={vi.fn()}
          knowledgeSpaces={spaces}
          knowledgeDocuments={documents}
          selectedKnowledgeSpaceIds={[]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={vi.fn()}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={vi.fn()}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByRole('combobox', { name: 'Knowledge space' }), {
      target: { value: '11' },
    })

    expect((await screen.findAllByText('Engineering')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Edit space' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete space' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit document' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Delete document' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeInTheDocument()
  })

  it('updates a knowledge space through the shared form', async () => {
    const updateKnowledgeSpace = vi.fn().mockResolvedValue({
      ...spaces[0],
      name: 'Platform',
      description: 'Updated',
    })

    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={vi.fn()}
          deleteKnowledgeSpace={vi.fn()}
          knowledgeSpaces={spaces}
          knowledgeDocuments={{}}
          selectedKnowledgeSpaceIds={[]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={updateKnowledgeSpace}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={vi.fn()}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit space' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Space name' }), {
      target: { value: 'Platform' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Space description' }), {
      target: { value: 'Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save space' }))

    await waitFor(() => {
      expect(updateKnowledgeSpace).toHaveBeenCalledWith(11, {
        name: 'Platform',
        description: 'Updated',
      })
    })
  })

  it('confirms before deleting a knowledge space', async () => {
    const deleteKnowledgeSpace = vi.fn().mockResolvedValue(true)

    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={vi.fn()}
          deleteKnowledgeSpace={deleteKnowledgeSpace}
          knowledgeSpaces={spaces}
          knowledgeDocuments={{}}
          selectedKnowledgeSpaceIds={[11]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={vi.fn()}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={vi.fn()}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete space' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete space' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(deleteKnowledgeSpace).toHaveBeenCalledWith(11)
    })
  })

  it('updates text documents and replaces attachment files from the editor', async () => {
    const updateKnowledgeDocument = vi.fn().mockResolvedValue(documents[11][0])
    const replaceKnowledgeDocumentFile = vi.fn().mockResolvedValue(documents[11][1])

    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={vi.fn()}
          deleteKnowledgeSpace={vi.fn()}
          knowledgeSpaces={spaces}
          knowledgeDocuments={documents}
          selectedKnowledgeSpaceIds={[]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={vi.fn()}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={updateKnowledgeDocument}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={replaceKnowledgeDocumentFile}
        />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByRole('combobox', { name: 'Knowledge space' }), {
      target: { value: '11' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit document' })[0]!)
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), {
      target: { value: 'Release plan' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Document content' }), {
      target: { value: 'Updated body' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))

    await waitFor(() => {
      expect(updateKnowledgeDocument).toHaveBeenCalledWith(11, 1, {
        title: 'Release plan',
        sourceUri: undefined,
        content: 'Updated body',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Replace file' }))
    fireEvent.change(screen.getByLabelText('Upload replacement file'), {
      target: { files: [new File(['# Updated'], 'updated.md', { type: 'text/markdown' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }))

    await waitFor(() => {
      expect(replaceKnowledgeDocumentFile).toHaveBeenCalled()
    })
  })

  it('confirms before deleting a knowledge document', async () => {
    const deleteKnowledgeDocument = vi.fn().mockResolvedValue(true)

    render(
      <TestProviders>
        <KnowledgeSettingsTab
          deleteKnowledgeDocument={deleteKnowledgeDocument}
          deleteKnowledgeSpace={vi.fn()}
          knowledgeSpaces={spaces}
          knowledgeDocuments={documents}
          selectedKnowledgeSpaceIds={[]}
          setSelectedKnowledgeSpaceIds={vi.fn()}
          loadKnowledgeDocuments={vi.fn()}
          createKnowledgeSpace={vi.fn()}
          updateKnowledgeSpace={vi.fn()}
          createKnowledgeDocument={vi.fn()}
          updateKnowledgeDocument={vi.fn()}
          uploadKnowledgeDocuments={vi.fn()}
          replaceKnowledgeDocumentFile={vi.fn()}
        />
      </TestProviders>,
    )

    fireEvent.change(await screen.findByRole('combobox', { name: 'Knowledge space' }), {
      target: { value: '11' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete document' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Delete document' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(deleteKnowledgeDocument).toHaveBeenCalledWith(11, 1)
    })
  })
})
