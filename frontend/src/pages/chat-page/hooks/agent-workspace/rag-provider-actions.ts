import { ragApi } from '../../../../lib/api'
import type { AgentWorkspaceContext } from './types'

export async function createRAGProviderAction({
  setRAGProviders,
  setChatErrorRef,
  tRef,
}: Pick<AgentWorkspaceContext, 'setRAGProviders' | 'setChatErrorRef' | 'tRef'>, payload: Parameters<typeof ragApi.createProvider>[0]) {
  try {
    const state = await ragApi.createProvider(payload)
    setRAGProviders(state)
    setChatErrorRef.current(null)
  } catch (error) {
    setChatErrorRef.current(
      error instanceof Error
        ? error.message
        : tRef.current('error.saveRagProvider'),
    )
  }
}

export async function activateRAGProviderAction({
  setRAGProviders,
  setChatErrorRef,
  tRef,
}: Pick<AgentWorkspaceContext, 'setRAGProviders' | 'setChatErrorRef' | 'tRef'>, providerId: number) {
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
}
