import type { ProviderState } from '../../../../types/chat'
import type { ProviderEditorMode } from '../../types'
import {
  mergeNewProviderFormWithFallback,
  resolveProviderEditorState,
} from '../../utils'
import type {
  ProviderEditorTarget,
  ProviderStateApplyOptions,
} from './types'

export function applyResolvedProviderEditorState(
  {
    providerEditorModeRef,
    setProviderEditorMode,
    setEditingProviderId,
    setProviderForm,
  }: ProviderStateApplyOptions,
  nextProviderEditor: ProviderEditorTarget,
) {
  providerEditorModeRef.current = nextProviderEditor.providerEditorMode
  setProviderEditorMode(nextProviderEditor.providerEditorMode)
  setEditingProviderId(nextProviderEditor.editingProviderId)
  setProviderForm(nextProviderEditor.providerForm)
}

export function applyProviderState(
  options: ProviderStateApplyOptions,
  nextState: ProviderState,
  preferredMode: ProviderEditorMode = options.providerEditorModeRef.current,
) {
  options.providerStateRef.current = nextState
  options.setProviderState(nextState)
  applyResolvedProviderEditorState(
    options,
    resolveProviderEditorState(nextState, preferredMode),
  )
}

export function mergeFormWithFetchedProviderState(
  options: ProviderStateApplyOptions,
  previousState: ProviderState | null,
  nextState: ProviderState,
) {
  if (options.providerEditorModeRef.current.type === 'auto') {
    applyResolvedProviderEditorState(
      options,
      resolveProviderEditorState(nextState, options.providerEditorModeRef.current),
    )
    return
  }

  if (options.providerEditorModeRef.current.type === 'new') {
    options.setProviderForm((previous) =>
      mergeNewProviderFormWithFallback(
        previous,
        previousState?.fallback,
        nextState.fallback,
      ),
    )
  }
}
