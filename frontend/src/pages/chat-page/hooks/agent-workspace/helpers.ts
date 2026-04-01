import type { KnowledgeDocument } from '../../../../types/chat'

export function upsertKnowledgeDocument(
  documents: KnowledgeDocument[],
  document: KnowledgeDocument,
) {
  return documents.some((entry) => entry.id === document.id)
    ? documents.map((entry) => (entry.id === document.id ? document : entry))
    : [document, ...documents]
}

export function prependKnowledgeDocuments(
  documents: KnowledgeDocument[],
  nextDocuments: KnowledgeDocument[],
) {
  return [...nextDocuments, ...documents]
}

export function removeKnowledgeDocument(
  documents: KnowledgeDocument[],
  documentId: number,
) {
  return documents.filter((entry) => entry.id !== documentId)
}

export function clearKnowledgeSpaceDocuments(
  documents: Record<number, KnowledgeDocument[]>,
  spaceId: number,
) {
  const nextDocuments = { ...documents }
  delete nextDocuments[spaceId]
  return nextDocuments
}

export function resolveWorkspaceLoadError({
  providersResult,
  spacesResult,
  fallbackMessage,
}: {
  providersResult: PromiseSettledResult<unknown>
  spacesResult: PromiseSettledResult<unknown>
  fallbackMessage: string
}) {
  if (providersResult.status === 'rejected') {
    return providersResult.reason instanceof Error
      ? providersResult.reason.message
      : fallbackMessage
  }

  if (spacesResult.status === 'rejected') {
    return spacesResult.reason instanceof Error
      ? spacesResult.reason.message
      : fallbackMessage
  }

  return null
}
