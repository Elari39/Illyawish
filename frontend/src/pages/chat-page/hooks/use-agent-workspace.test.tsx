import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { I18nProvider } from '../../../i18n/provider'
import type { KnowledgeDocument, KnowledgeSpace } from '../../../types/chat'
import { useAgentWorkspace } from './use-agent-workspace'

const getProvidersMock = vi.fn()
const listKnowledgeSpacesMock = vi.fn()
const createKnowledgeSpaceMock = vi.fn()
const updateKnowledgeSpaceMock = vi.fn()
const deleteKnowledgeSpaceMock = vi.fn()
const listKnowledgeDocumentsMock = vi.fn()
const createKnowledgeDocumentMock = vi.fn()
const updateKnowledgeDocumentMock = vi.fn()
const replaceKnowledgeDocumentFileMock = vi.fn()
const deleteKnowledgeDocumentMock = vi.fn()
const uploadKnowledgeDocumentsMock = vi.fn()

vi.mock('../../../lib/api', () => ({
  ragApi: {
    getProviders: (...args: unknown[]) => getProvidersMock(...args),
    listKnowledgeSpaces: (...args: unknown[]) => listKnowledgeSpacesMock(...args),
    createKnowledgeSpace: (...args: unknown[]) => createKnowledgeSpaceMock(...args),
    updateKnowledgeSpace: (...args: unknown[]) => updateKnowledgeSpaceMock(...args),
    deleteKnowledgeSpace: (...args: unknown[]) => deleteKnowledgeSpaceMock(...args),
    listKnowledgeDocuments: (...args: unknown[]) => listKnowledgeDocumentsMock(...args),
    createKnowledgeDocument: (...args: unknown[]) => createKnowledgeDocumentMock(...args),
    updateKnowledgeDocument: (...args: unknown[]) => updateKnowledgeDocumentMock(...args),
    replaceKnowledgeDocumentFile: (...args: unknown[]) => replaceKnowledgeDocumentFileMock(...args),
    deleteKnowledgeDocument: (...args: unknown[]) => deleteKnowledgeDocumentMock(...args),
    uploadKnowledgeDocuments: (...args: unknown[]) => uploadKnowledgeDocumentsMock(...args),
    createProvider: vi.fn(),
    activateProvider: vi.fn(),
  },
}))

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

const space: KnowledgeSpace = {
  id: 11,
  userId: 3,
  name: 'Engineering',
  description: 'Specs',
  createdAt: '2026-03-26T09:08:00Z',
  updatedAt: '2026-03-26T09:08:00Z',
}

const document: KnowledgeDocument = {
  id: 7,
  userId: 3,
  knowledgeSpaceId: 11,
  title: 'Checklist',
  sourceType: 'text',
  sourceUri: '',
  mimeType: '',
  content: 'hello',
  status: 'ready',
  chunkCount: 1,
  lastIndexedAt: '2026-03-26T09:08:00Z',
  createdAt: '2026-03-26T09:08:00Z',
  updatedAt: '2026-03-26T09:08:00Z',
}

describe('useAgentWorkspace', () => {
  beforeEach(() => {
    getProvidersMock.mockReset()
    listKnowledgeSpacesMock.mockReset()
    createKnowledgeSpaceMock.mockReset()
    updateKnowledgeSpaceMock.mockReset()
    deleteKnowledgeSpaceMock.mockReset()
    listKnowledgeDocumentsMock.mockReset()
    createKnowledgeDocumentMock.mockReset()
    updateKnowledgeDocumentMock.mockReset()
    replaceKnowledgeDocumentFileMock.mockReset()
    deleteKnowledgeDocumentMock.mockReset()
    uploadKnowledgeDocumentsMock.mockReset()

    getProvidersMock.mockResolvedValue(null)
    listKnowledgeSpacesMock.mockResolvedValue([])
  })

  it('removes deleted spaces from workspace state and clears cached documents', async () => {
    createKnowledgeSpaceMock.mockResolvedValue(space)
    listKnowledgeDocumentsMock.mockResolvedValue([document])
    deleteKnowledgeSpaceMock.mockResolvedValue(undefined)

    const { result } = renderHook(
      () =>
        useAgentWorkspace({
          isSettingsOpen: false,
          setChatError: vi.fn(),
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.createKnowledgeSpace({
        name: space.name,
        description: space.description,
      })
    })
    await act(async () => {
      await result.current.loadKnowledgeDocuments(space.id)
    })
    await act(async () => {
      await result.current.deleteKnowledgeSpace(space.id)
    })

    expect(result.current.knowledgeSpaces).toEqual([])
    expect(result.current.knowledgeDocuments[space.id]).toBeUndefined()
  })

  it('updates, replaces, and deletes cached documents in place', async () => {
    listKnowledgeSpacesMock.mockResolvedValue([space])
    listKnowledgeDocumentsMock.mockResolvedValue([document])
    updateKnowledgeDocumentMock.mockResolvedValue({
      ...document,
      title: 'Updated title',
      content: 'updated',
    })
    replaceKnowledgeDocumentFileMock.mockResolvedValue({
      ...document,
      title: 'guide.md',
      sourceType: 'attachment',
      mimeType: 'text/markdown',
      content: '# Guide',
    })
    deleteKnowledgeDocumentMock.mockResolvedValue(undefined)

    const { result } = renderHook(
      () =>
        useAgentWorkspace({
          isSettingsOpen: false,
          setChatError: vi.fn(),
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.loadWorkspace()
    })

    await act(async () => {
      await result.current.loadKnowledgeDocuments(space.id)
    })
    await act(async () => {
      await result.current.updateKnowledgeDocument(space.id, document.id, {
        title: 'Updated title',
        content: 'updated',
      })
    })

    expect(result.current.knowledgeDocuments[space.id]?.[0]?.title).toBe('Updated title')

    const replacementFile = new File(['# Guide'], 'guide.md', { type: 'text/markdown' })
    await act(async () => {
      await result.current.replaceKnowledgeDocumentFile(space.id, document.id, replacementFile)
    })

    expect(result.current.knowledgeDocuments[space.id]?.[0]?.title).toBe('guide.md')

    await act(async () => {
      await result.current.deleteKnowledgeDocument(space.id, document.id)
    })

    expect(result.current.knowledgeDocuments[space.id]).toEqual([])
  })

  it('keeps knowledge data when provider loading fails', async () => {
    const setChatError = vi.fn()
    getProvidersMock.mockRejectedValue(new Error('provider unavailable'))
    listKnowledgeSpacesMock.mockResolvedValue([space])

    const { result } = renderHook(
      () =>
        useAgentWorkspace({
          isSettingsOpen: false,
          setChatError,
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.loadWorkspace()
    })

    expect(result.current.ragProviders).toBeNull()
    expect(result.current.knowledgeSpaces).toEqual([space])
    expect(setChatError).toHaveBeenLastCalledWith('provider unavailable')
  })

  it('reports an error when knowledge spaces fail to load', async () => {
    const setChatError = vi.fn()
    listKnowledgeSpacesMock.mockRejectedValue(new Error('spaces unavailable'))

    const { result } = renderHook(
      () =>
        useAgentWorkspace({
          isSettingsOpen: false,
          setChatError,
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.loadWorkspace()
    })

    expect(result.current.knowledgeSpaces).toEqual([])
    expect(setChatError).toHaveBeenLastCalledWith('spaces unavailable')
  })
})
