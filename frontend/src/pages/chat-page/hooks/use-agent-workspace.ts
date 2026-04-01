import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { ragApi } from '../../../lib/api'
import type {
  CreateKnowledgeDocumentPayload,
  CreateKnowledgeSpacePayload,
  CreateRAGProviderPayload,
  KnowledgeDocument,
  KnowledgeSpace,
  RAGProviderState,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../../../types/chat'

interface UseAgentWorkspaceOptions {
  isSettingsOpen: boolean
  setChatError: (value: string | null) => void
}

export function useAgentWorkspace({
  isSettingsOpen,
  setChatError,
}: UseAgentWorkspaceOptions) {
  const { t } = useI18n()
  const setChatErrorRef = useRef(setChatError)
  const tRef = useRef(t)
  const [ragProviders, setRAGProviders] = useState<RAGProviderState | null>(null)
  const [knowledgeSpaces, setKnowledgeSpaces] = useState<KnowledgeSpace[]>([])
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<Record<number, KnowledgeDocument[]>>({})
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setChatErrorRef.current = setChatError
  }, [setChatError])

  useEffect(() => {
    tRef.current = t
  }, [t])

  const mergeDocumentIntoState = useCallback((spaceId: number, document: KnowledgeDocument) => {
    setKnowledgeDocuments((previous) => {
      const existing = previous[spaceId] ?? []
      const nextDocuments = existing.some((entry) => entry.id === document.id)
        ? existing.map((entry) => (entry.id === document.id ? document : entry))
        : [document, ...existing]
      return {
        ...previous,
        [spaceId]: nextDocuments,
      }
    })
  }, [])

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true)
    try {
      const [providersResult, spacesResult] = await Promise.allSettled([
        ragApi.getProviders(),
        ragApi.listKnowledgeSpaces(),
      ])

      let workspaceError: string | null = null
      const resolveWorkspaceError = (error: unknown) =>
        error instanceof Error
          ? error.message
          : tRef.current('error.loadAgentWorkspace')

      if (providersResult.status === 'fulfilled') {
        setRAGProviders(providersResult.value)
      } else {
        workspaceError = resolveWorkspaceError(providersResult.reason)
      }

      if (spacesResult.status === 'fulfilled') {
        setKnowledgeSpaces(spacesResult.value)
      } else if (workspaceError == null) {
        workspaceError = resolveWorkspaceError(spacesResult.reason)
      }

      setChatErrorRef.current(workspaceError)
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.loadAgentWorkspace'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [isSettingsOpen, loadWorkspace])

  const loadKnowledgeDocuments = useCallback(async (spaceId: number) => {
    try {
      const documents = await ragApi.listKnowledgeDocuments(spaceId)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: documents,
      }))
      setChatErrorRef.current(null)
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.loadKnowledgeDocuments'),
      )
    }
  }, [])

  const createRAGProvider = useCallback(async (payload: CreateRAGProviderPayload) => {
    try {
      const state = await ragApi.createProvider(payload)
      setRAGProviders(state)
      setChatErrorRef.current(null)
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error ? error.message : tRef.current('error.saveRagProvider'),
      )
    }
  }, [])

  const activateRAGProvider = useCallback(async (providerId: number) => {
    try {
      const state = await ragApi.activateProvider(providerId)
      setRAGProviders(state)
      setChatErrorRef.current(null)
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.activateRagProvider'),
      )
    }
  }, [])

  const createKnowledgeSpace = useCallback(async (payload: CreateKnowledgeSpacePayload) => {
    try {
      const space = await ragApi.createKnowledgeSpace(payload)
      setKnowledgeSpaces((previous) => [space, ...previous])
      setChatErrorRef.current(null)
      return space
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.createKnowledgeSpace'),
      )
      return null
    }
  }, [])

  const updateKnowledgeSpace = useCallback(async (spaceId: number, payload: UpdateKnowledgeSpacePayload) => {
    try {
      const space = await ragApi.updateKnowledgeSpace(spaceId, payload)
      setKnowledgeSpaces((previous) =>
        previous.map((entry) => (entry.id === spaceId ? space : entry)),
      )
      setChatErrorRef.current(null)
      return space
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.updateKnowledgeSpace'),
      )
      return null
    }
  }, [])

  const deleteKnowledgeSpace = useCallback(async (spaceId: number) => {
    try {
      await ragApi.deleteKnowledgeSpace(spaceId)
      setKnowledgeSpaces((previous) => previous.filter((entry) => entry.id !== spaceId))
      setKnowledgeDocuments((previous) => {
        const next = { ...previous }
        delete next[spaceId]
        return next
      })
      setChatErrorRef.current(null)
      return true
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.deleteKnowledgeSpace'),
      )
      return false
    }
  }, [])

  const createKnowledgeDocument = useCallback(async (spaceId: number, payload: CreateKnowledgeDocumentPayload) => {
    try {
      const document = await ragApi.createKnowledgeDocument(spaceId, payload)
      mergeDocumentIntoState(spaceId, document)
      setChatErrorRef.current(null)
      return document
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.createKnowledgeDocument'),
      )
      return null
    }
  }, [mergeDocumentIntoState])

  const updateKnowledgeDocument = useCallback(async (
    spaceId: number,
    documentId: number,
    payload: UpdateKnowledgeDocumentPayload,
  ) => {
    try {
      const document = await ragApi.updateKnowledgeDocument(spaceId, documentId, payload)
      mergeDocumentIntoState(spaceId, document)
      setChatErrorRef.current(null)
      return document
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.updateKnowledgeDocument'),
      )
      return null
    }
  }, [mergeDocumentIntoState])

  const deleteKnowledgeDocument = useCallback(async (spaceId: number, documentId: number) => {
    try {
      await ragApi.deleteKnowledgeDocument(spaceId, documentId)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: (previous[spaceId] ?? []).filter((entry) => entry.id !== documentId),
      }))
      setChatErrorRef.current(null)
      return true
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.deleteKnowledgeDocument'),
      )
      return false
    }
  }, [])

  const uploadKnowledgeDocuments = useCallback(async (spaceId: number, files: File[]) => {
    try {
      const documents = await ragApi.uploadKnowledgeDocuments(spaceId, files)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: [...documents, ...(previous[spaceId] ?? [])],
      }))
      setChatErrorRef.current(null)
      return documents
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.uploadKnowledgeDocuments'),
      )
      return null
    }
  }, [])

  const replaceKnowledgeDocumentFile = useCallback(async (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => {
    try {
      const document = await ragApi.replaceKnowledgeDocumentFile(spaceId, documentId, file, title)
      mergeDocumentIntoState(spaceId, document)
      setChatErrorRef.current(null)
      return document
    } catch (error) {
      setChatErrorRef.current(
        error instanceof Error
          ? error.message
          : tRef.current('error.replaceKnowledgeDocumentFile'),
      )
      return null
    }
  }, [mergeDocumentIntoState])

  return {
    ragProviders,
    knowledgeSpaces,
    knowledgeDocuments,
    isLoading,
    loadWorkspace,
    loadKnowledgeDocuments,
    createRAGProvider,
    activateRAGProvider,
    createKnowledgeSpace,
    updateKnowledgeSpace,
    deleteKnowledgeSpace,
    createKnowledgeDocument,
    updateKnowledgeDocument,
    deleteKnowledgeDocument,
    uploadKnowledgeDocuments,
    replaceKnowledgeDocumentFile,
  }
}
