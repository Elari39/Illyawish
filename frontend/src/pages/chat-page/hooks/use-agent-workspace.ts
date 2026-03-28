import { useCallback, useEffect, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import { ragApi, workflowApi } from '../../../lib/api'
import type {
  CreateKnowledgeDocumentPayload,
  CreateKnowledgeSpacePayload,
  CreateRAGProviderPayload,
  CreateWorkflowPresetPayload,
  KnowledgeDocument,
  KnowledgeSpace,
  RAGProviderState,
  UpdateWorkflowPresetPayload,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
  WorkflowPreset,
  WorkflowTemplate,
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
  const [ragProviders, setRAGProviders] = useState<RAGProviderState | null>(null)
  const [knowledgeSpaces, setKnowledgeSpaces] = useState<KnowledgeSpace[]>([])
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<Record<number, KnowledgeDocument[]>>({})
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([])
  const [workflowPresets, setWorkflowPresets] = useState<WorkflowPreset[]>([])
  const [isLoading, setIsLoading] = useState(false)

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
      const [providers, spaces, templates, presets] = await Promise.all([
        ragApi.getProviders(),
        ragApi.listKnowledgeSpaces(),
        workflowApi.listTemplates(),
        workflowApi.listPresets(),
      ])
      setRAGProviders(providers)
      setKnowledgeSpaces(spaces)
      setWorkflowTemplates(templates)
      setWorkflowPresets(presets)
      setChatError(null)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.loadAgentWorkspace'))
    } finally {
      setIsLoading(false)
    }
  }, [setChatError, t])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }
    void loadWorkspace()
  }, [isSettingsOpen, loadWorkspace])

  const loadKnowledgeDocuments = useCallback(async (spaceId: number) => {
    try {
      const documents = await ragApi.listKnowledgeDocuments(spaceId)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: documents,
      }))
      setChatError(null)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.loadKnowledgeDocuments'))
    }
  }, [setChatError, t])

  const createRAGProvider = useCallback(async (payload: CreateRAGProviderPayload) => {
    try {
      const state = await ragApi.createProvider(payload)
      setRAGProviders(state)
      setChatError(null)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.saveRagProvider'))
    }
  }, [setChatError, t])

  const activateRAGProvider = useCallback(async (providerId: number) => {
    try {
      const state = await ragApi.activateProvider(providerId)
      setRAGProviders(state)
      setChatError(null)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.activateRagProvider'))
    }
  }, [setChatError, t])

  const createKnowledgeSpace = useCallback(async (payload: CreateKnowledgeSpacePayload) => {
    try {
      const space = await ragApi.createKnowledgeSpace(payload)
      setKnowledgeSpaces((previous) => [space, ...previous])
      setChatError(null)
      return space
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.createKnowledgeSpace'))
      return null
    }
  }, [setChatError, t])

  const updateKnowledgeSpace = useCallback(async (spaceId: number, payload: UpdateKnowledgeSpacePayload) => {
    try {
      const space = await ragApi.updateKnowledgeSpace(spaceId, payload)
      setKnowledgeSpaces((previous) =>
        previous.map((entry) => (entry.id === spaceId ? space : entry)),
      )
      setChatError(null)
      return space
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.updateKnowledgeSpace'))
      return null
    }
  }, [setChatError, t])

  const deleteKnowledgeSpace = useCallback(async (spaceId: number) => {
    try {
      await ragApi.deleteKnowledgeSpace(spaceId)
      setKnowledgeSpaces((previous) => previous.filter((entry) => entry.id !== spaceId))
      setKnowledgeDocuments((previous) => {
        const next = { ...previous }
        delete next[spaceId]
        return next
      })
      setChatError(null)
      return true
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.deleteKnowledgeSpace'))
      return false
    }
  }, [setChatError, t])

  const createKnowledgeDocument = useCallback(async (spaceId: number, payload: CreateKnowledgeDocumentPayload) => {
    try {
      const document = await ragApi.createKnowledgeDocument(spaceId, payload)
      mergeDocumentIntoState(spaceId, document)
      setChatError(null)
      return document
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.createKnowledgeDocument'))
      return null
    }
  }, [mergeDocumentIntoState, setChatError, t])

  const updateKnowledgeDocument = useCallback(async (
    spaceId: number,
    documentId: number,
    payload: UpdateKnowledgeDocumentPayload,
  ) => {
    try {
      const document = await ragApi.updateKnowledgeDocument(spaceId, documentId, payload)
      mergeDocumentIntoState(spaceId, document)
      setChatError(null)
      return document
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.updateKnowledgeDocument'))
      return null
    }
  }, [mergeDocumentIntoState, setChatError, t])

  const deleteKnowledgeDocument = useCallback(async (spaceId: number, documentId: number) => {
    try {
      await ragApi.deleteKnowledgeDocument(spaceId, documentId)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: (previous[spaceId] ?? []).filter((entry) => entry.id !== documentId),
      }))
      setChatError(null)
      return true
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.deleteKnowledgeDocument'))
      return false
    }
  }, [setChatError, t])

  const uploadKnowledgeDocuments = useCallback(async (spaceId: number, files: File[]) => {
    try {
      const documents = await ragApi.uploadKnowledgeDocuments(spaceId, files)
      setKnowledgeDocuments((previous) => ({
        ...previous,
        [spaceId]: [...documents, ...(previous[spaceId] ?? [])],
      }))
      setChatError(null)
      return documents
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.uploadKnowledgeDocuments'))
      return null
    }
  }, [setChatError, t])

  const replaceKnowledgeDocumentFile = useCallback(async (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => {
    try {
      const document = await ragApi.replaceKnowledgeDocumentFile(spaceId, documentId, file, title)
      mergeDocumentIntoState(spaceId, document)
      setChatError(null)
      return document
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.replaceKnowledgeDocumentFile'))
      return null
    }
  }, [mergeDocumentIntoState, setChatError, t])

  const createWorkflowPreset = useCallback(async (payload: CreateWorkflowPresetPayload) => {
    try {
      const preset = await workflowApi.createPreset(payload)
      setWorkflowPresets((previous) => [preset, ...previous])
      setChatError(null)
      return preset
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.createWorkflowPreset'))
      return null
    }
  }, [setChatError, t])

  const updateWorkflowPreset = useCallback(async (presetId: number, payload: UpdateWorkflowPresetPayload) => {
    try {
      const preset = await workflowApi.updatePreset(presetId, payload)
      setWorkflowPresets((previous) =>
        previous.map((entry) => (entry.id === presetId ? preset : entry)),
      )
      setChatError(null)
      return preset
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.updateWorkflowPreset'))
      return null
    }
  }, [setChatError, t])

  const deleteWorkflowPreset = useCallback(async (presetId: number) => {
    try {
      await workflowApi.deletePreset(presetId)
      setWorkflowPresets((previous) => previous.filter((entry) => entry.id !== presetId))
      setChatError(null)
      return true
    } catch (error) {
      setChatError(error instanceof Error ? error.message : t('error.deleteWorkflowPreset'))
      return false
    }
  }, [setChatError, t])

  return {
    ragProviders,
    knowledgeSpaces,
    knowledgeDocuments,
    workflowTemplates,
    workflowPresets,
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
    createWorkflowPreset,
    updateWorkflowPreset,
    deleteWorkflowPreset,
  }
}
