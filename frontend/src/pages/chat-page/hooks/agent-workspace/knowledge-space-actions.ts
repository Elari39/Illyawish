import { ragApi } from '../../../../lib/api'
import { clearKnowledgeSpaceDocuments } from './helpers'
import type { AgentWorkspaceContext } from './types'

export async function createKnowledgeSpaceAction({
  setKnowledgeSpaces,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeSpaces' | 'setChatErrorRef' | 'tRef'
>, payload: Parameters<typeof ragApi.createKnowledgeSpace>[0]) {
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
}

export async function updateKnowledgeSpaceAction({
  setKnowledgeSpaces,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeSpaces' | 'setChatErrorRef' | 'tRef'
>, spaceId: number, payload: Parameters<typeof ragApi.updateKnowledgeSpace>[1]) {
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
}

export async function deleteKnowledgeSpaceAction({
  setKnowledgeSpaces,
  setKnowledgeDocuments,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  'setKnowledgeSpaces' | 'setKnowledgeDocuments' | 'setChatErrorRef' | 'tRef'
>, spaceId: number) {
  try {
    await ragApi.deleteKnowledgeSpace(spaceId)
    setKnowledgeSpaces((previous) =>
      previous.filter((entry) => entry.id !== spaceId),
    )
    setKnowledgeDocuments((previous) =>
      clearKnowledgeSpaceDocuments(previous, spaceId),
    )
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
}
