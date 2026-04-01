import { ragApi } from '../../../../lib/api'
import {
  prependKnowledgeDocuments,
  removeKnowledgeDocument,
  upsertKnowledgeDocument,
} from './helpers'
import type { AgentWorkspaceContext } from './types'

export async function loadKnowledgeDocumentsAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number) {
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
}

export async function createKnowledgeDocumentAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, payload: Parameters<typeof ragApi.createKnowledgeDocument>[1]) {
  try {
    const document = await ragApi.createKnowledgeDocument(spaceId, payload)
    setKnowledgeDocuments((previous) => ({
      ...previous,
      [spaceId]: upsertKnowledgeDocument(previous[spaceId] ?? [], document),
    }))
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
}

export async function updateKnowledgeDocumentAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, documentId: number, payload: Parameters<typeof ragApi.updateKnowledgeDocument>[2]) {
  try {
    const document = await ragApi.updateKnowledgeDocument(
      spaceId,
      documentId,
      payload,
    )
    setKnowledgeDocuments((previous) => ({
      ...previous,
      [spaceId]: upsertKnowledgeDocument(previous[spaceId] ?? [], document),
    }))
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
}

export async function deleteKnowledgeDocumentAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, documentId: number) {
  try {
    await ragApi.deleteKnowledgeDocument(spaceId, documentId)
    setKnowledgeDocuments((previous) => ({
      ...previous,
      [spaceId]: removeKnowledgeDocument(previous[spaceId] ?? [], documentId),
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
}

export async function uploadKnowledgeDocumentsAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, files: File[]) {
  try {
    const documents = await ragApi.uploadKnowledgeDocuments(spaceId, files)
    setKnowledgeDocuments((previous) => ({
      ...previous,
      [spaceId]: prependKnowledgeDocuments(previous[spaceId] ?? [], documents),
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
}

export async function replaceKnowledgeDocumentFileAction({
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, documentId: number, file: File, title?: string) {
  try {
    const document = await ragApi.replaceKnowledgeDocumentFile(
      spaceId,
      documentId,
      file,
      title,
    )
    setKnowledgeDocuments((previous) => ({
      ...previous,
      [spaceId]: upsertKnowledgeDocument(previous[spaceId] ?? [], document),
    }))
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
}
