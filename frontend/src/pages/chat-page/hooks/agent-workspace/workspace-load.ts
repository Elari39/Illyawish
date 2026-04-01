import { ragApi } from '../../../../lib/api'
import type { AgentWorkspaceContext } from './types'
import { resolveWorkspaceLoadError } from './helpers'

export async function loadWorkspaceAction({
  setRAGProviders,
  setKnowledgeSpaces,
  setIsLoading,
  setChatErrorRef,
  tRef,
}: Pick<
  AgentWorkspaceContext,
  | 'setRAGProviders'
  | 'setKnowledgeSpaces'
  | 'setIsLoading'
  | 'setChatErrorRef'
  | 'tRef'
>) {
  setIsLoading(true)

  try {
    const [providersResult, spacesResult] = await Promise.allSettled([
      ragApi.getProviders(),
      ragApi.listKnowledgeSpaces(),
    ])

    if (providersResult.status === 'fulfilled') {
      setRAGProviders(providersResult.value)
    }

    if (spacesResult.status === 'fulfilled') {
      setKnowledgeSpaces(spacesResult.value)
    }

    setChatErrorRef.current(
      resolveWorkspaceLoadError({
        providersResult,
        spacesResult,
        fallbackMessage: tRef.current('error.loadAgentWorkspace'),
      }),
    )
  } catch (error) {
    setChatErrorRef.current(
      error instanceof Error
        ? error.message
        : tRef.current('error.loadAgentWorkspace'),
    )
  } finally {
    setIsLoading(false)
  }
}
