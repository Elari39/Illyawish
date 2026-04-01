import type { ProviderPreset } from '../../../../types/chat'
import type { ProviderEditorMode, ProviderFormState } from '../../types'
import {
  createProviderForm,
  defaultBaseURLForProviderFormat,
  normalizeProviderFormat,
  resolveProviderEditorState,
} from '../../utils'
import type { ProviderEditorActionOptions } from './types'

export function createProviderEditorActions({
  providerState,
  providerStateRef,
  providerEditorModeRef,
  setProviderForm,
  setEditingProviderId,
  setProviderEditorMode,
  applyResolvedProviderEditor,
}: ProviderEditorActionOptions) {
  function resetProviderEditorMode() {
    const nextProviderEditorMode: ProviderEditorMode = { type: 'auto' }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)

    if (providerStateRef.current) {
      applyResolvedProviderEditor(
        resolveProviderEditorState(
          providerStateRef.current,
          nextProviderEditorMode,
        ),
      )
    }
  }

  function handleStartNewProvider() {
    const nextProviderEditorMode: ProviderEditorMode = { type: 'new' }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)
    setEditingProviderId(null)
    setProviderForm(createProviderForm(providerState?.fallback))
  }

  function handleEditProvider(preset: ProviderPreset) {
    const nextProviderEditorMode: ProviderEditorMode = {
      type: 'edit',
      providerId: preset.id,
    }
    providerEditorModeRef.current = nextProviderEditorMode
    setProviderEditorMode(nextProviderEditorMode)
    setEditingProviderId(preset.id)
    setProviderForm(createProviderForm(providerState?.fallback, preset))
  }

  function handleProviderFieldChange(
    field: 'format' | 'name' | 'baseURL' | 'apiKey' | 'defaultModel',
    value: string,
  ) {
    if (field === 'format') {
      setProviderForm((previous) => {
        const nextFormat = normalizeProviderFormat(value)
        const previousFormat = normalizeProviderFormat(previous.format)
        const previousDefaultBaseURL =
          defaultBaseURLForProviderFormat(previousFormat)
        const shouldResetBaseURL =
          !previous.baseURL.trim() || previous.baseURL === previousDefaultBaseURL

        return {
          ...previous,
          format: nextFormat,
          baseURL: shouldResetBaseURL
            ? defaultBaseURLForProviderFormat(nextFormat)
            : previous.baseURL,
          errors: {
            ...previous.errors,
            format: undefined,
            baseURL: undefined,
          },
        }
      })
      return
    }

    setProviderForm((previous) => ({
      ...previous,
      [field]: value,
      errors: {
        ...previous.errors,
        [field]: undefined,
      },
    }))
  }

  function handleProviderModelsChange(
    value: Pick<ProviderFormState, 'models' | 'defaultModel'>,
  ) {
    setProviderForm((previous) => ({
      ...previous,
      ...value,
      errors: {
        ...previous.errors,
        models: undefined,
        modelItems: [],
        defaultModel: undefined,
      },
    }))
  }

  return {
    resetProviderEditorMode,
    handleStartNewProvider,
    handleEditProvider,
    handleProviderFieldChange,
    handleProviderModelsChange,
  }
}
