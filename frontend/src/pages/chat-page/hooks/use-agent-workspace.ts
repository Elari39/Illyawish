import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../../i18n/use-i18n'
import type {
  KnowledgeDocument,
  KnowledgeSpace,
  RAGProviderState,
} from '../../../types/chat'
import {
  createKnowledgeDocumentAction,
  deleteKnowledgeDocumentAction,
  loadKnowledgeDocumentsAction,
  replaceKnowledgeDocumentFileAction,
  updateKnowledgeDocumentAction,
  uploadKnowledgeDocumentsAction,
} from './agent-workspace/knowledge-document-actions'
import {
  createKnowledgeSpaceAction,
  deleteKnowledgeSpaceAction,
  updateKnowledgeSpaceAction,
} from './agent-workspace/knowledge-space-actions'
import {
  activateRAGProviderAction,
  createRAGProviderAction,
} from './agent-workspace/rag-provider-actions'
import type {
  KnowledgeDocumentActions,
  KnowledgeSpaceActions,
  RAGProviderActions,
  WorkspaceLoadActions,
} from './agent-workspace/types'
import { loadWorkspaceAction } from './agent-workspace/workspace-load'

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

  const loadWorkspace = useCallback<WorkspaceLoadActions['loadWorkspace']>(
    () =>
      loadWorkspaceAction({
        setRAGProviders,
        setKnowledgeSpaces,
        setIsLoading,
        setChatErrorRef,
        tRef,
      }),
    [],
  )

  useEffect(() => {
    void loadWorkspace()
  }, [isSettingsOpen, loadWorkspace])

  const createRAGProvider = useCallback<RAGProviderActions['createRAGProvider']>(
    (payload) =>
      createRAGProviderAction({
        setRAGProviders,
        setChatErrorRef,
        tRef,
      }, payload),
    [],
  )

  const activateRAGProvider = useCallback<RAGProviderActions['activateRAGProvider']>(
    (providerId) =>
      activateRAGProviderAction({
        setRAGProviders,
        setChatErrorRef,
        tRef,
      }, providerId),
    [],
  )

  const createKnowledgeSpace = useCallback<KnowledgeSpaceActions['createKnowledgeSpace']>(
    (payload) =>
      createKnowledgeSpaceAction({
        setKnowledgeSpaces,
        setChatErrorRef,
        tRef,
      }, payload),
    [],
  )

  const updateKnowledgeSpace = useCallback<KnowledgeSpaceActions['updateKnowledgeSpace']>(
    (spaceId, payload) =>
      updateKnowledgeSpaceAction({
        setKnowledgeSpaces,
        setChatErrorRef,
        tRef,
      }, spaceId, payload),
    [],
  )

  const deleteKnowledgeSpace = useCallback<KnowledgeSpaceActions['deleteKnowledgeSpace']>(
    (spaceId) =>
      deleteKnowledgeSpaceAction({
        setKnowledgeSpaces,
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId),
    [],
  )

  const loadKnowledgeDocuments = useCallback<KnowledgeDocumentActions['loadKnowledgeDocuments']>(
    (spaceId) =>
      loadKnowledgeDocumentsAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId),
    [],
  )

  const createKnowledgeDocument = useCallback<KnowledgeDocumentActions['createKnowledgeDocument']>(
    (spaceId, payload) =>
      createKnowledgeDocumentAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId, payload),
    [],
  )

  const updateKnowledgeDocument = useCallback<KnowledgeDocumentActions['updateKnowledgeDocument']>(
    (spaceId, documentId, payload) =>
      updateKnowledgeDocumentAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId, documentId, payload),
    [],
  )

  const deleteKnowledgeDocument = useCallback<KnowledgeDocumentActions['deleteKnowledgeDocument']>(
    (spaceId, documentId) =>
      deleteKnowledgeDocumentAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId, documentId),
    [],
  )

  const uploadKnowledgeDocuments = useCallback<KnowledgeDocumentActions['uploadKnowledgeDocuments']>(
    (spaceId, files) =>
      uploadKnowledgeDocumentsAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId, files),
    [],
  )

  const replaceKnowledgeDocumentFile = useCallback<KnowledgeDocumentActions['replaceKnowledgeDocumentFile']>(
    (spaceId, documentId, file, title) =>
      replaceKnowledgeDocumentFileAction({
        setKnowledgeDocuments,
        setChatErrorRef,
        tRef,
      }, spaceId, documentId, file, title),
    [],
  )

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
