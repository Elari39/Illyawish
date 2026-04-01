import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { I18nContextValue } from '../../../../i18n/context'
import type {
  CreateKnowledgeDocumentPayload,
  CreateKnowledgeSpacePayload,
  CreateRAGProviderPayload,
  KnowledgeDocument,
  KnowledgeSpace,
  RAGProviderState,
  UpdateKnowledgeDocumentPayload,
  UpdateKnowledgeSpacePayload,
} from '../../../../types/chat'

export interface AgentWorkspaceRefs {
  setChatErrorRef: MutableRefObject<(value: string | null) => void>
  tRef: MutableRefObject<I18nContextValue['t']>
}

export interface AgentWorkspaceStateSetters {
  setRAGProviders: Dispatch<SetStateAction<RAGProviderState | null>>
  setKnowledgeSpaces: Dispatch<SetStateAction<KnowledgeSpace[]>>
  setKnowledgeDocuments: Dispatch<
    SetStateAction<Record<number, KnowledgeDocument[]>>
  >
  setIsLoading: Dispatch<SetStateAction<boolean>>
}

export interface AgentWorkspaceContext
  extends AgentWorkspaceRefs,
    AgentWorkspaceStateSetters {}

export interface WorkspaceLoadActions {
  loadWorkspace: () => Promise<void>
}

export interface RAGProviderActions {
  createRAGProvider: (
    payload: CreateRAGProviderPayload,
  ) => Promise<void>
  activateRAGProvider: (providerId: number) => Promise<void>
}

export interface KnowledgeSpaceActions {
  createKnowledgeSpace: (
    payload: CreateKnowledgeSpacePayload,
  ) => Promise<KnowledgeSpace | null>
  updateKnowledgeSpace: (
    spaceId: number,
    payload: UpdateKnowledgeSpacePayload,
  ) => Promise<KnowledgeSpace | null>
  deleteKnowledgeSpace: (spaceId: number) => Promise<boolean>
}

export interface KnowledgeDocumentActions {
  loadKnowledgeDocuments: (spaceId: number) => Promise<void>
  createKnowledgeDocument: (
    spaceId: number,
    payload: CreateKnowledgeDocumentPayload,
  ) => Promise<KnowledgeDocument | null>
  updateKnowledgeDocument: (
    spaceId: number,
    documentId: number,
    payload: UpdateKnowledgeDocumentPayload,
  ) => Promise<KnowledgeDocument | null>
  deleteKnowledgeDocument: (
    spaceId: number,
    documentId: number,
  ) => Promise<boolean>
  uploadKnowledgeDocuments: (
    spaceId: number,
    files: File[],
  ) => Promise<KnowledgeDocument[] | null>
  replaceKnowledgeDocumentFile: (
    spaceId: number,
    documentId: number,
    file: File,
    title?: string,
  ) => Promise<KnowledgeDocument | null>
}
